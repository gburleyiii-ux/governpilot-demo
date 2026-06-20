import { buildRetrievalReadiness } from "../server/retrieval-readiness.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const localReadiness = await buildRetrievalReadiness({
  version: "0.22.0",
  authMode: "local-dev",
  agentMode: "deterministic-local",
  storage: { mode: "local-json" },
  env: {},
});

assert(localReadiness.status === "local-ready", `expected local-ready, received ${localReadiness.status}`);
assert(localReadiness.readinessVersion === "sentinelops-retrieval-readiness/v1", "expected readiness version");
assert(localReadiness.corpus.algorithm === "local-tfidf-cosine-v1", "expected local TF-IDF algorithm");
assert(localReadiness.corpus.documentCount >= 5, "expected approved knowledge documents");
assert(localReadiness.corpus.vocabularySize >= 60, "expected meaningful vocabulary");
assert(localReadiness.backends.some((backend) => backend.id === "local-tfidf" && backend.status === "ready"), "expected local backend");
assert(
  localReadiness.backends.some((backend) => backend.id === "openai-embeddings" && backend.status === "credential-required"),
  "expected embedding backend credential gate",
);
assert(
  localReadiness.backends.some((backend) => backend.id === "pgvector" && backend.status === "database-required"),
  "expected pgvector database gate",
);
assert(localReadiness.counts.passingControls === localReadiness.counts.totalControls, "expected local controls to pass");
assert(localReadiness.probeResults.length === 3, "expected probe query results");
assert(localReadiness.probeResults.every((probe) => probe.topCitationId && probe.score > 0), "expected positive probe citations");
assert(localReadiness.migration.sql.includes("create extension if not exists vector"), "expected pgvector migration SQL");
assert(localReadiness.migration.sql.includes("sentinelops_knowledge_chunks"), "expected knowledge chunks table");
assert(!JSON.stringify(localReadiness).includes("sk-test-secret"), "expected no raw secret disclosure");

const vectorReadiness = await buildRetrievalReadiness({
  version: "0.22.0",
  authMode: "oidc",
  agentMode: "live",
  storage: { mode: "aws-s3-dynamodb" },
  env: {
    SENTINELOPS_RETRIEVAL_BACKEND: "pgvector",
    OPENAI_API_KEY: "sk-test-secret",
    SENTINELOPS_PGVECTOR_DATABASE_URL: "postgres://user:password@db.example/sentinelops",
  },
});

assert(vectorReadiness.status === "vector-ready", `expected vector-ready, received ${vectorReadiness.status}`);
assert(vectorReadiness.recommendedBackend === "pgvector", "expected pgvector recommendation");
assert(vectorReadiness.counts.configuredBackends === 3, "expected all retrieval backends configured");
assert(vectorReadiness.controls.every((control) => control.passed), "expected vector readiness controls to pass");
assert(!JSON.stringify(vectorReadiness).includes("sk-test-secret"), "expected OpenAI secret redaction");
assert(!JSON.stringify(vectorReadiness).includes("password@"), "expected database credential redaction");

const requestedWithoutCredentials = await buildRetrievalReadiness({
  version: "0.22.0",
  authMode: "jwt",
  agentMode: "deterministic-local",
  storage: { mode: "local-json" },
  env: {
    SENTINELOPS_RETRIEVAL_BACKEND: "pgvector",
  },
});

assert(requestedWithoutCredentials.status === "review-required", "expected requested pgvector backend to require review");
assert(
  requestedWithoutCredentials.controls.some((control) => control.id === "RAG-003" && !control.passed),
  "expected embedding credential control to fail",
);
assert(
  requestedWithoutCredentials.controls.some((control) => control.id === "RAG-004" && !control.passed),
  "expected pgvector storage control to fail",
);

console.log(
  JSON.stringify(
    {
      localStatus: localReadiness.status,
      vectorStatus: vectorReadiness.status,
      reviewRequiredStatus: requestedWithoutCredentials.status,
      documentCount: localReadiness.corpus.documentCount,
      vocabularySize: localReadiness.corpus.vocabularySize,
      backendCount: localReadiness.counts.backends,
      probeQueries: localReadiness.counts.probeQueries,
      noSecretDisclosure: !JSON.stringify(vectorReadiness).includes("sk-test-secret"),
      noDatabaseCredentialDisclosure: !JSON.stringify(vectorReadiness).includes("password@"),
    },
    null,
    2,
  ),
);
