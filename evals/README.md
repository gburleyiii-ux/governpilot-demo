# SentinelOps AI Local Evals

Run:

```bash
npm run evals:local
```

The harness exercises the real SentinelOps agent adapter in deterministic mode by default. It covers:

- approved controlled-pilot path;
- pending approval block;
- missing rollback evidence block;
- denied action group block.
- prompt-injection red-team block after approval;
- retrieval-policy drift block after approval.

Results are written to `evals/results/latest.json`.
