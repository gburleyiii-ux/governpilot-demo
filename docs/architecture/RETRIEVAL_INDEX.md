# SentinelOps AI Retrieval Index

SentinelOps uses a local TF-IDF cosine retrieval index in `agent/retrieval.mjs` for deterministic RAG evidence during portfolio demos.

## Why Local

The local index keeps the demo stable without embedding API keys while still demonstrating retrieval design:

- approved knowledge files are loaded from `knowledge/*.md`;
- documents are tokenized with a small stop-word filter;
- inverse document frequency is computed across the local corpus;
- queries and documents are scored with cosine similarity;
- citations include algorithm, corpus size, vocabulary size, score, and matched terms.

## Agent Integration

`agent/sentinelops-agent.mjs` calls `retrievePolicyContext()` before deterministic or live-mode review. The citations are attached to:

- agent review output;
- evidence packet exports;
- dashboard citation cards;
- eval traces.

## Scale Readiness

`GET /api/retrieval/readiness` reports the current local index plus gated OpenAI embeddings and pgvector readiness for larger approved corpora. See `docs/architecture/RETRIEVAL_BACKENDS.md`.

## Verification

Run:

```bash
npm run retrieval:check
npm run retrieval:readiness-check
```

The smoke test proves targeted queries retrieve the expected top document for:

- write-capable tool approval;
- prompt-injection controls;
- retrieval-policy drift;
- audit evidence export.

The readiness smoke test also proves local fallback, pgvector credential gates, embedding credential gates, positive probe citations, migration SQL, and secret non-disclosure.
