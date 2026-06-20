# SentinelOps AI Observability

SentinelOps exposes a local monitoring summary that turns governance evidence into operational SLOs and alert signals.

## Runtime Surface

- API endpoint: `GET /api/observability/summary`
- Alert routing: `GET /api/observability/routes` and `POST /api/observability/alerts/dispatch`
- Live delivery readiness: `GET /api/observability/live-delivery`
- Dashboard tab: `Observability`
- Implementation: `server/observability.mjs`
- Verification: `npm run observability:check` and `npm run delivery:check`

The endpoint is read-only and does not expose secrets, raw evidence packet content, bearer tokens, or signing keys.

## SLOs

The summary reports five deployment-readiness SLOs:

- Approval ledger integrity: validates approval signatures and previous-hash chain links.
- Eval pass rate: expects the latest local eval report to pass all cases.
- Policy pass rate: expects recorded runtime policy checks to pass.
- Retrieval citation coverage: expects latest agent-review citations to include retrieval metadata.
- Latest run audit completeness: expects approval, policy check, agent review, and audit event coverage for the latest run.

## Alert Signals

The alert list is intentionally operational rather than cosmetic:

- `ledger-integrity-fail` for signature or hash-chain failures.
- `policy-check-fail` for failed runtime policy checks.
- `eval-pack-fail` for failing regression cases.
- `agent-review-missing` when an approved run has not been reviewed by the agent.
- `approval-record-missing` when run state and signed approval records diverge.
- `audit-events-empty` when no audit events are present.
- `monitoring-clear` when all monitored signals are inside target.

## Evidence Included

The summary includes counts for runs, approvals, policy checks, agent reviews, alert dispatches, and audit events. It also exposes safe signal metadata for the approval ledger, latest policy check, latest eval report, retrieval citation coverage, and recent audit events. The Observability dashboard also shows live delivery readiness for approved SMTP, Slack, webhook, and SIEM providers.

## Local Verification

Run:

```bash
npm run observability:check
```

The smoke test builds a synthetic healthy ledger, confirms all SLOs pass, then tampers with the latest approval and eval report to prove the ledger and eval alerts fire.
