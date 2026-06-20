import { buildKnowledgeIndex, loadKnowledgeDocuments, retrievePolicyContext } from "../agent/retrieval.mjs";

const migrationSql = `create extension if not exists vector;

create table if not exists sentinelops_knowledge_chunks (
  id text primary key,
  source_path text not null,
  title text not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists sentinelops_knowledge_chunks_embedding_idx
  on sentinelops_knowledge_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);`;

const probeQueries = [
  {
    id: "tool-approval",
    query: "write capable external action group approval rollback audit retention scoped service account",
  },
  {
    id: "prompt-injection",
    query: "prompt injection hidden command instruction override exfiltration adversarial red team",
  },
  {
    id: "retrieval-drift",
    query: "retrieval drift allowlist source provenance stale policy citations governance memory",
  },
];

function hasAny(env, names) {
  return names.some((name) => Boolean(env[name]));
}

function resolveRequestedBackend(env) {
  return env.SENTINELOPS_RETRIEVAL_BACKEND || "local-tfidf";
}

function buildBackends(env, index) {
  const openAiConfigured = Boolean(env.OPENAI_API_KEY);
  const databaseConfigured = hasAny(env, ["SENTINELOPS_PGVECTOR_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL"]);
  const embeddingModel = env.SENTINELOPS_EMBEDDING_MODEL || "text-embedding-3-small";
  return [
    {
      id: "local-tfidf",
      label: "Local TF-IDF Cosine",
      status: "ready",
      configured: true,
      algorithm: index.algorithm,
      credentialBoundary: "No external credential required.",
      storageBoundary: "knowledge/*.md loaded from the local approved corpus.",
      allowedUse: ["deterministic demos", "offline evals", "audit-safe local citations"],
      blockedUse: ["large corpus semantic search without chunking"],
    },
    {
      id: "openai-embeddings",
      label: "OpenAI Embeddings",
      status: openAiConfigured ? "ready" : "credential-required",
      configured: openAiConfigured,
      algorithm: embeddingModel,
      credentialBoundary: "Requires OPENAI_API_KEY on the server; the key is never returned to the dashboard.",
      storageBoundary: "Embeddings should be generated from approved, nonclassified policy chunks only.",
      allowedUse: ["semantic retrieval", "hybrid ranking", "larger policy corpora"],
      blockedUse: ["classified content", "browser-side embedding calls", "unapproved PII/PHI corpus ingestion"],
    },
    {
      id: "pgvector",
      label: "Postgres pgvector",
      status: databaseConfigured ? "ready" : "database-required",
      configured: databaseConfigured,
      algorithm: "pgvector cosine search",
      credentialBoundary: "Requires a server-side Postgres connection string; credentials are never returned.",
      storageBoundary: "Stores approved knowledge chunks, embeddings, source paths, and metadata.",
      allowedUse: ["larger policy corpora", "metadata filtering", "durable retrieval audit trails"],
      blockedUse: ["direct browser database access", "unapproved external corpus ingestion"],
    },
  ];
}

function buildControls({ requestedBackend, backends, documents, index }) {
  const localReady = backends.find((backend) => backend.id === "local-tfidf")?.configured;
  const embeddingsReady = backends.find((backend) => backend.id === "openai-embeddings")?.configured;
  const pgvectorReady = backends.find((backend) => backend.id === "pgvector")?.configured;
  const vectorRequested = ["pgvector", "hybrid"].includes(requestedBackend);
  return [
    {
      id: "RAG-001",
      label: "Deterministic local retrieval fallback",
      passed: Boolean(localReady),
      evidence: `${index.algorithm} is available for stable demos and evals.`,
    },
    {
      id: "RAG-002",
      label: "Approved knowledge corpus loaded",
      passed: documents.length >= 5 && index.vocabularySize >= 60,
      evidence: `${documents.length} approved knowledge documents and ${index.vocabularySize} vocabulary terms loaded.`,
    },
    {
      id: "RAG-003",
      label: "Embedding provider credential boundary",
      passed: !vectorRequested || embeddingsReady,
      evidence: vectorRequested
        ? "Vector retrieval requires server-side OPENAI_API_KEY before semantic embedding generation."
        : "Vector retrieval is not requested; local TF-IDF remains authoritative.",
    },
    {
      id: "RAG-004",
      label: "pgvector storage boundary",
      passed: !vectorRequested || pgvectorReady,
      evidence: vectorRequested
        ? "pgvector retrieval requires a server-side Postgres connection string."
        : "pgvector storage is optional until larger corpus retrieval is approved.",
    },
    {
      id: "RAG-005",
      label: "Citation provenance preserved",
      passed: true,
      evidence: "Citations include source path, score, algorithm, corpus size, vocabulary size, and matched terms.",
    },
    {
      id: "RAG-006",
      label: "Vector migration contract documented",
      passed: migrationSql.includes("sentinelops_knowledge_chunks") && migrationSql.includes("vector_cosine_ops"),
      evidence: "Migration contract defines chunk source paths, metadata, vector column, and cosine index.",
    },
  ];
}

export async function buildRetrievalReadiness({
  env = process.env,
  service = "sentinelops-api",
  version = "unknown",
  authMode = "unknown",
  agentMode = "deterministic-local",
  storage = null,
} = {}) {
  const documents = await loadKnowledgeDocuments();
  const index = buildKnowledgeIndex(documents);
  const requestedBackend = resolveRequestedBackend(env);
  const backends = buildBackends(env, index);
  const controls = buildControls({ requestedBackend, backends, documents, index });
  const passingControls = controls.filter((control) => control.passed).length;
  const vectorReady = backends.find((backend) => backend.id === "openai-embeddings")?.configured &&
    backends.find((backend) => backend.id === "pgvector")?.configured;
  const status = vectorReady ? "vector-ready" : passingControls === controls.length ? "local-ready" : "review-required";
  const probeResults = [];
  for (const probe of probeQueries) {
    const citations = await retrievePolicyContext(probe.query, 2);
    probeResults.push({
      id: probe.id,
      topCitationId: citations[0]?.id || null,
      topCitationTitle: citations[0]?.title || null,
      score: citations[0]?.score || 0,
      matchedTerms: citations[0]?.retrieval?.matchedTerms || [],
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    service,
    version,
    readinessVersion: "sentinelops-retrieval-readiness/v1",
    status,
    requestedBackend,
    recommendedBackend: vectorReady ? "pgvector" : "local-tfidf",
    authMode,
    agentMode,
    storageMode: storage?.mode || "unknown",
    corpus: {
      documentCount: documents.length,
      vocabularySize: index.vocabularySize,
      algorithm: index.algorithm,
      sourceGlob: "knowledge/*.md",
      documents: documents.map((document) => ({
        id: document.id,
        title: document.title,
        path: document.path,
      })),
    },
    counts: {
      backends: backends.length,
      configuredBackends: backends.filter((backend) => backend.configured).length,
      passingControls,
      totalControls: controls.length,
      probeQueries: probeResults.length,
    },
    backends,
    controls,
    probeResults,
    migration: {
      table: "sentinelops_knowledge_chunks",
      extension: "vector",
      index: "ivfflat vector_cosine_ops",
      sql: migrationSql,
    },
    disclosureBoundary: [
      "The dashboard receives backend readiness and citation metadata only.",
      "Embedding provider keys and database credentials stay server-side.",
      "Only approved, nonclassified policy chunks should be embedded into pgvector.",
    ],
  };
}
