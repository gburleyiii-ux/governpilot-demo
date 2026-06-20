# SentinelOps AI Cost Guardrails

SentinelOps exposes model-route cost, token, and latency guardrails as server-owned policy metadata. The dashboard receives estimates and limits, not prompts, completions, invoices, account data, API keys, or raw provider telemetry. No prompt, completion, invoice, account identifier, or provider secret should be returned by this endpoint.

## API Surface

- `GET /api/model-gateway/cost-guardrails`
  - Returns guardrail status, preferred route budget, route-level estimates, policy limits, control checks, and disclosure boundaries.

## Guardrail Policy

Default local policy:

- per-run budget: `$0.50`
- daily pilot budget: `$25.00`
- monthly pilot budget: `$500.00`
- max pilot runs per day: `40`
- max prompt tokens: `6000`
- max completion tokens: `1800`
- max total tokens: `7800`
- max p95 latency: `5500 ms`

These defaults are portfolio policy inputs. Before live use, replace them with the approved budget envelope and provider/account billing data.

## Configurable Inputs

- `SENTINELOPS_RUN_BUDGET_USD`
- `SENTINELOPS_DAILY_PILOT_BUDGET_USD`
- `SENTINELOPS_MONTHLY_PILOT_BUDGET_USD`
- `SENTINELOPS_MAX_PILOT_RUNS_PER_DAY`
- `SENTINELOPS_MAX_PROMPT_TOKENS`
- `SENTINELOPS_MAX_COMPLETION_TOKENS`
- `SENTINELOPS_MAX_TOTAL_TOKENS`
- `SENTINELOPS_MAX_P95_LATENCY_MS`
- `SENTINELOPS_LIVE_BUDGET_APPROVED=true`

Route-specific estimator overrides use this pattern:

- `SENTINELOPS_OPENAI_AGENTS_SDK_INPUT_USD_PER_1K`
- `SENTINELOPS_OPENAI_AGENTS_SDK_OUTPUT_USD_PER_1K`
- `SENTINELOPS_OPENAI_AGENTS_SDK_PROMPT_TOKENS`
- `SENTINELOPS_OPENAI_AGENTS_SDK_COMPLETION_TOKENS`
- `SENTINELOPS_OPENAI_AGENTS_SDK_P95_LATENCY_MS`

The same pattern applies to `AWS_BEDROCK_GOVCLOUD`.

## Controls

- `CBG-001` Per-run spend stays inside reviewer budget.
- `CBG-002` Daily pilot spend is bounded.
- `CBG-003` Token envelope is enforced.
- `CBG-004` Latency envelope is enforced.
- `CBG-005` Live model budget approval gate.
- `CBG-006` Cost telemetry disclosure boundary.

## Verification

Run:

```bash
npm run cost:check
```

The smoke test proves:

- deterministic-local mode has zero external model spend;
- live model mode requires explicit budget approval;
- over-budget routes move to `review-required`;
- the guardrail payload does not disclose raw model secrets.
