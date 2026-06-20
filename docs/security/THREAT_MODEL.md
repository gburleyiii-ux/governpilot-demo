# SentinelOps AI Threat Model

## Scope

This threat model covers the SentinelOps AI governed agent control plane, local deterministic reviewer, approval ledger, eval harness, evidence exports, and the GovCloud pilot deployment skeleton.

## Protected Assets

- Signed approval records and hash chain
- Reviewer identity and role context
- Evaluation results and red-team findings
- Evidence packet exports
- Active policy documents and retrieved governance citations
- Retrieval backend readiness, embedding configuration, and pgvector migration metadata
- Generated Rego compatibility modules and unsupported-condition inventory
- Model gateway secrets and provider credentials
- Model-route cost, token, and latency guardrail estimates
- Alert delivery provider readiness, webhook configuration, and SIEM collector metadata
- Runtime logs, traces, and audit events

## Trust Boundaries

| Boundary | Trust Assumption | Control |
| --- | --- | --- |
| Browser to API | UI state is untrusted | Server-side RBAC checks before mutation |
| Identity token to API | Claims must be verified before role mapping | HS256 JWT or RS256/JWKS signature, issuer, audience, expiry, key-id, and group-role checks |
| Policy-as-code bundle to gate decision | Policy rules must be testable and reviewable | Declarative runtime and infrastructure controls with smoke coverage |
| Official policy source to active enforcement | New source text may be incomplete, stale, or misinterpreted | Source registry, provenance hashes, change queue, and human activation review |
| Rego compatibility export to enterprise policy review | Generated modules must not hide unsupported policy semantics | Operator allowlist, unsupported-condition reporting, and `npm run rego:check` |
| API to model provider | Model output is untrusted | Deterministic default mode, eval gate, citation review |
| Cost guardrail export to dashboard | Budget metadata must not expose prompts, invoices, or account telemetry | Route estimates, token ceilings, latency limits, live-budget approval gate, and no raw provider telemetry |
| Alert delivery provider to API | Live delivery must not expose credentials or send before approval | Live delivery readiness gate, provider config checks, payload contracts, and `npm run delivery:check` |
| Retrieval content to reviewer | Retrieved text is untrusted | Prompt-injection standard, TF-IDF citation metadata, source-path citations, drift eval |
| Retrieval backend to vector store | Larger corpus retrieval must preserve provenance and credential boundaries | Server-side embeddings, pgvector migration contract, source-path metadata, and readiness checks |
| Evidence manifest to auditor | Manifest must detect tampering | Approval signature recomputation, previous-hash verification, packet and section hashes |
| ECS task to AWS services | Network path is constrained | Private subnets, VPC endpoints, no public task IP |
| Evidence export to reviewer | Packet must be audit-safe | Signed approvals, policy checks, citation provenance |
| Terraform state to secrets | State is not a secret store | Secrets Manager placeholder, out-of-band secret writes |

## Primary Threats

### Approval Bypass

An attacker changes browser state or API payloads to approve a write-capable action group without a valid reviewer role.

Mitigations:
- `/api/runs/:id/approval` resolves actor and role server-side.
- `approve_gate` and `deny_gate` are enforced before state mutation.
- `npm run smoke:rbac` proves auditor approval is blocked.
- `npm run auth:check` proves JWT-mode anonymous mutation and auditor approval are blocked.
- `npm run auth:oidc-check` proves RS256/JWKS tokens reject unknown key IDs and preserve the RBAC boundary.
- `npm run policy:check` proves runtime policy-as-code catches missing reviewer identity and missing rollback evidence.

### Prompt Injection

Retrieved content or user text attempts to override system policy, reveal sensitive data, or trigger unapproved tools.

Mitigations:
- Prompt-injection standard is retrieved as local governance context.
- Red-team eval case blocks approved runs when prompt-injection failure is present.
- Reviewer output uses `policy-blocked` instead of allowing scoped tools.

### Retrieval Policy Drift

Stale or unapproved governance memory conflicts with the approved policy baseline and misleads the reviewer.

Mitigations:
- Retrieval-policy standard defines allowlist and source provenance controls.
- Drift eval blocks approved runs when policy compliance fails.
- Evidence packets include retrieved citation paths.
- `npm run retrieval:check` proves key governance queries retrieve the expected approved source documents.

### Retrieval Backend Misconfiguration

Embedding or pgvector retrieval is enabled without approved credentials, corpus source paths, metadata, or database access boundaries.

Mitigations:
- `GET /api/retrieval/readiness` reports local TF-IDF, OpenAI embeddings, and pgvector readiness without exposing credentials.
- `RAG-*` controls fail closed when pgvector is requested without server-side embedding and database configuration.
- The pgvector migration contract stores source paths, content, metadata, and vector columns for auditability.
- `npm run retrieval:readiness-check` proves local fallback, vector credential gates, migration SQL, probe citations, and secret non-disclosure.

### Evidence Tampering

Approval or evidence artifacts are modified after decision time.

Mitigations:
- Approval records are HMAC-signed locally.
- Records include `previousHash` for hash-chain verification.
- `server/audit-integrity.mjs` recomputes signatures, validates previous-hash links, and hashes evidence manifests.
- GovCloud storage mode mirrors approvals to encrypted DynamoDB with point-in-time recovery.
- Evidence exports persist to encrypted, versioned S3 in AWS mode and ignored local files in demo mode.
- `npm run audit:check` proves payload tampering and chain tampering are detected.

### Credential Exposure

Model gateway keys or provider credentials leak through source, Terraform state, logs, or evidence exports.

Mitigations:
- Live mode is disabled unless `SENTINELOPS_AGENT_MODE=live` and credentials are present.
- `GET /api/model-gateway` reports provider readiness using booleans and environment-variable names only.
- The deterministic local route remains available when live credentials are missing.
- Terraform creates only a Secrets Manager placeholder.
- Docs explicitly require out-of-band secret population.
- Evidence packet policy forbids secrets and raw sensitive data.

### Public Runtime Exposure

Pilot service becomes internet reachable before security controls are reviewed.

Mitigations:
- Terraform uses private subnets and `assign_public_ip = false`.
- ALB is internal only.
- Allowed CIDRs are explicit variables.
- AWS access paths use VPC endpoints.

### Policy Drift

Runtime or infrastructure controls drift away from the expected pilot posture while documentation still claims compliance.

Mitigations:
- `server/policies/policy-as-code.json` defines reviewer, trace, evidence, private-networking, encryption, VPC endpoint, and runtime-mutation controls.
- Approval policy checks merge runtime policy-as-code results into the signed evidence flow.
- Infrastructure policy checks inspect the GovCloud Terraform skeleton for the expected controls.
- `npm run policy:check` proves both passing and intentionally failing control paths.

### Policy Source Drift

Official sources change, customer policy documents are updated, or regulatory text is misread and enforced before a qualified owner approves it.

Mitigations:
- `GET /api/policies/intelligence` reports the official source registry, source provenance expectations, and review queue.
- New policy source changes are staged as review items and are not auto-enforced.
- The active bundle remains `server/policies/policy-as-code.json` until approved mappings are activated.
- `npm run policy:intel-check` proves source registry coverage, SHA-256 provenance fields, live-fetch approval gating, and no-auto-enforcement posture.

### Rego Compatibility Drift

The generated Rego export diverges from the JSON policy-as-code bundle or silently drops unsupported operators.

Mitigations:
- `server/rego-compat.mjs` maps every supported operator into an explicit Rego expression.
- Unsupported operators are returned in `unsupportedConditions` instead of being ignored.
- `GET /api/policies/rego` reports module counts, rule counts, supported operators, and usage guidance.
- `npm run rego:check` proves current runtime and infrastructure modules generate with zero unsupported conditions.

### Incomplete Audit Handoff

An exported evidence packet is separated from the state, policy, or approval data needed to prove its integrity.

Mitigations:
- `GET /api/runs/:id/evidence-manifest` returns packet hash, section hashes, approval checks, and audit completeness flags.
- `GET /api/runs/:id/evidence-bundle` returns the evidence packet with its manifest.
- The manifest itself is hashed for handoff tracking.

### Observability Blind Spot

Ledger, eval, retrieval, or audit failures occur but are not visible to operators reviewing a deployment.

Mitigations:
- `GET /api/observability/summary` exposes read-only SLOs and alert signals for the current state.
- The dashboard `Observability` tab shows ledger, eval, policy, retrieval, and audit health from the API.
- `npm run observability:check` proves healthy SLOs and tamper-triggered alert behavior.

### Alert Routing Abuse

A lower-privilege operator attempts to route governance alerts or an attacker tampers with dispatch evidence after routing.

Mitigations:
- `POST /api/observability/alerts/dispatch` requires `route_alerts`.
- Dispatch records are HMAC-signed and chained newest-to-oldest.
- `GET /api/observability/routes` reports dispatch ledger verification.
- `npm run alerts:check` proves operator routing is blocked and dispatch signatures verify.

### Live Delivery Misconfiguration

Live email, Slack, webhook, or SIEM delivery is enabled before approval, with missing provider configuration, or with credential values leaking through the dashboard.

Mitigations:
- `GET /api/observability/live-delivery` reports live delivery readiness without sending external messages.
- `POST /api/observability/alerts/live-dispatch` executes provider delivery only after `route_alerts` authorization, explicit live approval, and complete server-side configuration.
- `SENTINELOPS_LIVE_DELIVERY_APPROVED=true` is required before live mode can become `live-ready`.
- `LDR-*` controls fail closed when requested providers are missing server-side configuration.
- The endpoint returns provider booleans and environment-variable names only, never SMTP passwords, webhook URLs, bearer tokens, or SIEM tokens.
- `npm run delivery:check` proves simulated, live-ready, review-required, and credential non-disclosure behavior.
- `npm run delivery:execute-check` proves approved SMTP, Slack, webhook, and SIEM execution against local collectors plus missing-approval blocking.

### Model Gateway Misrouting

A live provider route receives regulated payloads without approved credentials, GovCloud alignment, or reviewer-controlled policy gates.

Mitigations:
- Gateway status exposes provider readiness without secrets.
- OpenAI and Bedrock routes require explicit live credentials.
- Bedrock routing checks GovCloud region alignment.
- Missing credentials trigger deterministic fallback instead of unreviewed external inference.
- `npm run gateway:check` proves fallback routing, provider preference, and secret non-disclosure.

### Cost Budget Overrun

Live model routes consume spend or latency beyond the approved pilot budget before a reviewer notices.

Mitigations:
- `GET /api/model-gateway/cost-guardrails` reports route-level cost, token, and p95 latency estimates against reviewer-defined policy limits.
- Live model mode requires `SENTINELOPS_LIVE_BUDGET_APPROVED=true` before the budget control passes.
- The API returns estimates and policy metadata only, not raw prompts, completions, invoices, account identifiers, or provider telemetry.
- `npm run cost:check` proves local zero-spend behavior, live-budget approval enforcement, over-budget detection, and secret non-disclosure.

## Residual Risks

- Local JSON remains the default for reliable demos; GovCloud mode requires AWS credentials, an encrypted S3 bucket, and a DynamoDB approval ledger.
- OIDC/JWKS mode validates identity-provider tokens, but production must still configure the real issuer, audience, group claim, key rotation expectations, and IdP access lifecycle.
- Policy intelligence source fetching is readiness-scaffolded; production must approve customer source connectors, source cadence, owner assignments, and legal/compliance review authority.
- The Terraform module is a reviewable skeleton and must be planned in a real GovCloud account before production use.
- Live model mode requires a separate egress, data-handling, and provider-risk review.

## Verification Evidence

- `npm run evals:local` proves approval, denial, missing-evidence, prompt-injection, and retrieval-drift behavior.
- `npm run smoke:rbac` proves lower-privilege roles cannot approve gates.
- `npm run auth:oidc-check` proves enterprise-style OIDC group tokens map to RBAC and reject unknown signing keys.
- `npm run policy:check` proves declarative runtime and infrastructure policy controls.
- `npm run policy:intel-check` proves official policy source registry, human review queue, and no-auto-enforcement controls.
- `npm run rego:check` proves OPA/Rego compatibility for current runtime and infrastructure policy operators.
- `npm run audit:check` proves evidence manifest hashes and approval-ledger tamper detection.
- `npm run retrieval:check` proves the local retrieval index returns expected policy citations.
- `npm run retrieval:readiness-check` proves retrieval backend readiness and pgvector credential gates.
- `npm run gateway:check` proves model gateway fallback, provider routing, and secret non-disclosure.
- `npm run cost:check` proves cost, token, latency, live-budget approval, and disclosure guardrails.
- `npm run observability:check` proves SLO and alert behavior for healthy and tampered states.
- `npm run alerts:check` proves signed alert dispatch and route-alert RBAC behavior.
- `npm run delivery:check` proves live delivery readiness approval gates, provider config checks, and secret non-disclosure.
- `npm run delivery:execute-check` and `npm run delivery:api-check` prove approved live delivery execution and SIEM collector handling without exposing secrets.
- `npm run smoke:api` proves signed approval, policy check, agent review, and evidence export paths.
- Browser artifacts in `docs/design/` show the RBAC and red-team eval views.
