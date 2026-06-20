# SentinelOps AI API Contract

Base URL: `http://127.0.0.1:4175/api`

OpenAPI file: `docs/architecture/openapi.json`

## HTTP Hardening

- Responses include `Content-Security-Policy`, `Cross-Origin-Opener-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- Browser CORS grants are exact-origin only unless `SENTINELOPS_CORS_ORIGINS=*` is intentionally configured. Production pilots should set `SENTINELOPS_CORS_ORIGINS` to the customer-approved app origins.
- JSON request bodies are limited by `SENTINELOPS_MAX_JSON_BYTES`, defaulting to 1 MiB. Oversized JSON returns `413`; malformed JSON returns `400`.
- Mutating JSON requests are inspected by `server/data-protection.mjs` before authorization or persistence. Sensitive pilot-data violations return `422` with category/path findings and no raw sensitive value.

## Endpoints

- `GET /health`
  - Reports service readiness, storage mode/path, auth mode, run count, RBAC role count, and whether `OPENAI_API_KEY` is configured.
- `GET /auth/context`
  - Returns safe auth configuration metadata and role mapping context. Secrets are never returned.
- `GET /data-protection`
  - Returns pilot data-boundary mode, blocked categories, and active controls without requiring sensitive sample input.
- `GET /rbac/roles`
  - Returns the default reviewer actor and local role catalog.
- `GET /policies/active`
  - Returns the active action-group policy.
- `GET /policies/as-code`
  - Returns the declarative runtime and infrastructure policy-as-code bundle.
- `GET /policies/intelligence`
  - Returns the official policy source registry, source provenance fields, change review queue, active bundle boundary, and controls that prevent automatic enforcement of unapproved policy interpretations.
- `GET /policies/infrastructure`
  - Evaluates the GovCloud Terraform skeleton against infrastructure policy-as-code controls.
- `GET /policies/rego`
  - Returns OPA/Rego compatibility metadata, generated `sentinelops.runtime` and `sentinelops.infrastructure` modules, supported operators, rule mappings, and OPA usage guidance.
- `GET /model-gateway`
  - Returns safe model gateway readiness metadata for deterministic local, OpenAI Agents SDK, and AWS Bedrock GovCloud routes.
  - Includes provider status, preferred route, routing plan, credential boundaries, cost and latency envelopes, and gateway control checks.
- `GET /model-gateway/cost-guardrails`
  - Returns model-route cost, token, and p95 latency guardrails with route estimates, budget controls, live-budget approval status, and safe disclosure boundaries.
- `GET /evals/latest`
  - Returns the latest local eval report, or an empty report if evals have not been run.
- `GET /retrieval/readiness`
  - Returns retrieval backend readiness for local TF-IDF, OpenAI embeddings, and pgvector, including corpus stats, control checks, probe citations, migration SQL, and safe disclosure boundaries.
- `GET /trusted-workforce/readiness`
  - Returns Trusted Workforce/NBIS readiness status, official source registry, personnel-vetting lifecycle stages, procedure templates, work instructions, data boundaries, policy controls, and sanitized evidence metadata.
- `GET /trusted-workforce/sources`
  - Returns the Trusted Workforce/NBIS source registry with provenance metadata and the personnel-vetting data boundary.
- `GET /trusted-workforce/process`
  - Returns lifecycle and procedure templates for position designation, initiation, investigation, adjudication handoff, access, continuous vetting, and evidence.
- `GET /trusted-workforce/work-instructions`
  - Returns task-level FSO/SSO/security-manager work instructions with evidence and forbidden-input boundaries.
- `GET /trusted-workforce/evidence`
  - Returns sanitized Trusted Workforce readiness evidence as JSON, or Markdown when `Accept: text/markdown` is supplied.
- `POST /trusted-workforce/process/:id/approval`
  - Body: `{ "state": "approved" | "denied", "reviewer": "...", "reviewerRole": "..." }`.
  - Requires approval/denial RBAC and returns a readiness decision without writing NBIS or applicant data.
- `GET /observability/summary`
  - Returns read-only SLOs, alert signals, safe counts, approval-ledger status, eval health, retrieval citation coverage, and recent audit events.
- `GET /observability/routes`
  - Returns the simulated email, Slack, and SIEM route catalog, recent dispatch records, and dispatch ledger verification.
- `GET /observability/live-delivery`
  - Returns approval-gated live delivery readiness for SMTP, Slack, webhook, and SIEM providers without exposing credential values or sending external traffic.
- `GET /observability/siem`
  - Returns OCSF-like SIEM event previews for current observability alerts without external delivery.
- `POST /observability/alerts/dispatch`
  - Body may include `{ "reviewer": "...", "reviewerRole": "..." }`.
  - Requires `route_alerts`.
  - Simulates routing current observability alerts, signs dispatch records, appends the dispatch ledger, and returns SIEM-shaped events.
- `POST /observability/alerts/live-dispatch`
  - Body may include `{ "reviewer": "...", "reviewerRole": "..." }`.
  - Requires `route_alerts`.
  - Executes approved live delivery only when readiness is `live-ready`.
  - Sends SMTP, Slack, SIEM, and generic webhook payloads from server-side configuration, appends signed live dispatch records, and returns safe attempt metadata without credential values.
- `GET /runs/latest`
  - Returns the latest run and creates one if the local store is empty.
- `POST /runs`
  - Requires `create_run`.
  - Creates and persists a new assessment run.
- `POST /runs/:id/approval`
  - Body: `{ "state": "approved" | "denied", "reviewer": "Grant Burley III", "reviewerRole": "security-reviewer", "note": "..." }`
  - Requires `approve_gate` for approvals and `deny_gate` for denials.
  - Applies the gate decision, runs policy checks, signs the approval record with reviewer role context, and persists the transition.
- `POST /runs/:id/evals`
  - Body may include `{ "reviewer": "...", "reviewerRole": "..." }`.
  - Requires `run_evals`.
  - Reruns the deterministic eval pack and persists the scores.
- `POST /runs/:id/agent-review`
  - Body may include `{ "reviewer": "...", "reviewerRole": "..." }`.
  - Requires `run_agent_review`.
  - Runs the SentinelOps deployment reviewer. Defaults to deterministic-local mode; uses OpenAI Agents SDK only when live mode and credentials are configured.
- `GET /runs/:id/audit`
  - Returns approval records, policy checks, agent reviews, and audit events.
- `GET /audit/integrity`
  - Requires `export_evidence`.
  - Verifies the global approval ledger signatures and previous-hash chain.
- `GET /audit/export`
  - Requires `export_evidence`.
  - Returns an all-runs JSON export with global approval-ledger verification, dataset hashes, run inventory, evidence manifest hashes, retention guidance, and an export hash.
- `GET /runs/:id/evidence-manifest`
  - Requires `export_evidence`.
  - Returns packet hash, section hashes, approval-ledger verification, audit completeness flags, and manifest hash.
- `GET /runs/:id/evidence-bundle`
  - Requires `export_evidence`.
  - Returns the evidence manifest plus the Markdown evidence packet.
- `GET /runs/:id/evidence`
  - Headers may include `x-sentinelops-reviewer` and `x-sentinelops-role`.
  - Requires `export_evidence`.
  - Persists a Markdown evidence packet through the active storage adapter, then returns it.

Unauthorized role attempts return `403` with the blocked permission and resolved actor.

Unauthorized `jwt` and `oidc` requests return `401` before RBAC checks. In `local-dev` mode, the API accepts dashboard reviewer fields and `x-sentinelops-*` headers for demos. In `jwt` mode, reviewer identity and role come from verified HS256 bearer-token claims. In `oidc` mode, reviewer identity and role come from RS256 bearer-token claims verified against `SENTINELOPS_AUTH_JWKS_URL`.

## Storage

By default, local state is written to `data/sentinelops-state.json`, which is intentionally ignored by git. Evidence exports are written to `data/evidence/`.

Set `SENTINELOPS_STORAGE_ADAPTER=aws` with `SENTINELOPS_STATE_BUCKET`, `SENTINELOPS_APPROVAL_LEDGER_TABLE`, and AWS credentials to use the GovCloud-oriented adapter:

- state snapshots and evidence packets go to S3;
- new signed approvals are mirrored to DynamoDB;
- `/api/health`, `/api/system`, and run bundles report `storageMode: aws-s3-dynamodb`.

## Production Mode

After `npm run build`, `npm run start` serves both the React app and the API from `http://127.0.0.1:4175/`.

`Dockerfile` and `docker-compose.yml` package the same single-service runtime. The container persists local JSON state through the `sentinelops-data` volume.

## Agent Boundary

The API is intentionally shaped as the future agent boundary:

- the web app never talks directly to a model provider;
- approvals are server-owned;
- reviewer roles are enforced by the server before state changes;
- policy checks happen before evidence export;
- model gateway routing stays server-owned and falls back to deterministic local mode when live credentials are absent or policy gates should block external inference;
- cost, token, and latency guardrails are server-owned and must pass before live model use is approved;
- retrieval backend readiness is server-owned and fails closed when pgvector or embedding credentials are missing;
- Trusted Workforce/NBIS readiness is server-owned, synthetic by default, and blocks live NBIS automation unless customer authorization, account boundary, and security review are complete;
- runtime policy-as-code checks are merged into approval policy results;
- policy intelligence watches official sources and customer policy vaults, but detected changes require human review before active enforcement;
- Rego modules are exported for enterprise policy-library review without making OPA the local runtime authority by default;
- evidence manifests verify approval signatures, previous-hash links, packet hashes, and section hashes;
- full audit exports provide all-runs ledger verification, dataset hashes, run manifest inventory, and retention guidance;
- observability summarizes ledger, eval, policy, retrieval, and audit health without exposing secrets;
- alert routing is permission-gated and simulated locally while preserving signed dispatch evidence;
- live delivery readiness and execution report approved SMTP, Slack, webhook, and SIEM status without returning secrets;
- agent reviews are persisted and exported with the evidence packet;
- live OpenAI or Bedrock orchestration can be added behind `POST /runs` and eval endpoints without changing the UI contract.
