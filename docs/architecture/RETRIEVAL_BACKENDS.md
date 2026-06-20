# SentinelOps AI Retrieval Backends

SentinelOps now exposes retrieval backend readiness through `GET /api/retrieval/readiness`. The local TF-IDF index remains the deterministic audit baseline, while OpenAI embeddings and pgvector are treated as gated scale paths for larger approved policy corpora.

## API Surface

- `GET /api/retrieval/readiness`
  - Returns corpus stats, backend readiness, RAG controls, probe-query citations, pgvector migration SQL, and disclosure boundaries.

## Backend Paths

- `local-tfidf`
  - Always available.
  - Loads approved Markdown from `knowledge/*.md`.
  - Returns source paths, scores, matched terms, corpus size, and vocabulary size.
- `openai-embeddings`
  - Requires server-side `OPENAI_API_KEY`.
  - Uses `SENTINELOPS_EMBEDDING_MODEL` or defaults to `text-embedding-3-small`.
  - Never exposes provider keys to the dashboard.
- `pgvector`
  - Requires `SENTINELOPS_PGVECTOR_DATABASE_URL`, `DATABASE_URL`, or `POSTGRES_URL`.
  - Stores approved chunks, source paths, metadata, and vectors.
  - Intended for larger policy libraries after corpus approval.

## Runtime Controls

- `RAG-001` Deterministic local retrieval fallback.
- `RAG-002` Approved knowledge corpus loaded.
- `RAG-003` Embedding provider credential boundary.
- `RAG-004` pgvector storage boundary.
- `RAG-005` Citation provenance preserved.
- `RAG-006` Vector migration contract documented.

## pgvector Migration Contract

The readiness response includes migration SQL for:

- `create extension if not exists vector`
- `sentinelops_knowledge_chunks`
- `embedding vector(1536)`
- `metadata jsonb`
- `ivfflat` cosine index using `vector_cosine_ops`

## Verification

Run:

```bash
npm run retrieval:check
npm run retrieval:readiness-check
```

The readiness smoke test proves:

- local retrieval is `local-ready` without external credentials;
- vector retrieval becomes `vector-ready` only when embedding and pgvector credentials are configured;
- requested pgvector mode fails closed without those credentials;
- probe queries produce positive citation matches;
- provider/database secrets are not disclosed.
