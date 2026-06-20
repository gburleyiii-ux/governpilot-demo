# SentinelOps AI Model Gateway

The model gateway readiness layer documents how SentinelOps AI can move from deterministic local review to controlled OpenAI Agents SDK or AWS Bedrock GovCloud routes without changing the dashboard contract.

## API Surface

- `GET /api/model-gateway`
  - Returns provider readiness, preferred route, routing rules, cost and latency envelopes, and control checks.
  - Returns only safe metadata. It never returns raw API keys, workload identity tokens, or credential material.
- `GET /api/model-gateway/cost-guardrails`
  - Returns route-level cost, token, and p95 latency policy checks for deterministic local, OpenAI Agents SDK, and AWS Bedrock GovCloud routes.

## Provider Routes

- `deterministic-local`
  - Always available for demos, evals, offline review, and portfolio verification.
  - No external model credential required.
- `openai-agents-sdk`
  - Requires `SENTINELOPS_AGENT_MODE=live` and `OPENAI_API_KEY`.
  - Stays behind the SentinelOps API boundary; the browser never calls OpenAI directly.
- `aws-bedrock-govcloud`
  - Requires GovCloud region alignment through `SENTINELOPS_AWS_REGION` or `AWS_REGION`.
  - Requires approved AWS workload identity such as task role, web identity, or access key configuration.
  - Intended for regulated controlled-pilot payloads after reviewer approval.

## Controls

- `MGW-001` No model secrets in API responses.
- `MGW-002` Server-side model boundary.
- `MGW-003` Deterministic fallback route.
- `MGW-004` GovCloud region guard.
- `MGW-005` Live mode credential gate.
- `MGW-006` Cost and latency envelope declared.

Cost guardrail controls are documented in `docs/architecture/COST_GUARDRAILS.md` and verified by `npm run cost:check`.

## Routing Behavior

1. Default to deterministic-local when live mode is unset.
2. Use OpenAI Agents SDK only when live mode and `OPENAI_API_KEY` are present.
3. Prefer the Bedrock GovCloud route when GovCloud region and workload identity are configured.
4. Fall back to deterministic-local when credentials are absent or policy checks fail.

## Verification

Run:

```bash
npm run gateway:check
npm run cost:check
```

The smoke tests prove deterministic fallback, OpenAI live readiness, GovCloud Bedrock preference, control coverage, cost/token/latency guardrails, live-budget approval behavior, and secret non-disclosure.
