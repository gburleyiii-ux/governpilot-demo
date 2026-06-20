# GAGS-Generated Continuous-Monitoring Plan

Standard: GAGS 0.1.0.

Instrument: `GAGS conformance suite (npm run conformance) + GAGS TCK`. Automated: true. L1 MUST failures block merge via .github/workflows (GAGS SC-1).

| GAGS | Requirement | Level | Monitor (check) | Cadence |
| --- | --- | --- | --- | --- |
| GA-1 | Every governed action bound to an identified run | L1 MUST | `smoke:api` | every CI run + every release (build-gating) |
| GA-2 | No auto-enforcement; activation requires recorded human decision | L1 MUST | `smoke:rbac, policy:intel-check` | every CI run + every release (build-gating) |
| GA-3 | Documented RACI enforced by RBAC | L2 | `smoke:rbac` | every CI run (reported, non-gating) |
| HA-1 | Approval-before-write on write-capable actions | L1 MUST | `smoke:api, smoke:rbac` | every CI run + every release (build-gating) |
| HA-2 | Missing evidence blocks action | L1 MUST | `evals:local` | every CI run + every release (build-gating) |
| HA-3 | Approval/denial decisions signed and bound to run | L1 MUST | `audit:check` | every CI run + every release (build-gating) |
| HA-4 | No approval-privilege escalation via API | L1 MUST | `smoke:rbac` | every CI run + every release (build-gating) |
| PC-1 | Active policy is declarative and exportable | L1 MUST | `policy:check` | every CI run + every release (build-gating) |
| PC-2 | Policy exportable to OPA/Rego with no dropped conditions | L1 MUST | `rego:check` | every CI run + every release (build-gating) |
| PC-3 | Governance citations reference registered sources | L1 MUST | `retrieval:check` | every CI run + every release (build-gating) |
| PC-4 | Source registry change-reviewed and versioned | L2 | `policy:intel-check` | every CI run (reported, non-gating) |
| EG-1 | Pass core regression suite before pilot | L1 MUST | `evals:local` | every CI run + every release (build-gating) |
| EG-2 | Failing/watch safety eval blocks tool activation | L1 MUST | `smoke:api` | every CI run + every release (build-gating) |
| EG-3 | Prompt-injection / retrieval-drift red-team blocks run | L1 MUST | `evals:local` | every CI run + every release (build-gating) |
| EG-4 | Eval results attached to evidence packet | L2 | `evals:local` | every CI run (reported, non-gating) |
| AE-1 | Append-only hash-chained ledger; tamper detectable | L1 MUST | `audit:check` | every CI run + every release (build-gating) |
| AE-2 | Evidence packets content-addressed; manifest hash covers artifacts | L1 MUST | `smoke:api` | every CI run + every release (build-gating) |
| AE-3 | No default signing key in production; refuse boot or label dev-signed | L1 MUST | `signing:check` | every CI run + every release (build-gating) |
| AE-4 | Permission-gated full audit export with export hash | L1 MUST | `audit:check` | every CI run + every release (build-gating) |
| IA-1 | Every mutating endpoint enforces permission; default deny | L1 MUST | `smoke:rbac` | every CI run + every release (build-gating) |
| IA-2 | Token integrity verified; alg=none/confusion rejected | L1 MUST | `auth:check, auth:oidc-check` | every CI run + every release (build-gating) |
| IA-3 | Federate to agency IdP; map groups to roles | L2 | `auth:oidc-check` | every CI run (reported, non-gating) |
| IA-4 | Multi-tenant isolation of runs/policies/evidence | L2 | `tenancy:check` | every CI run (reported, non-gating) |
| DP-1 | Declared machine-readable data boundary | L1 MUST | `data:check` | every CI run + every release (build-gating) |
| DP-2 | Secrets never in responses/evidence/logs/exports | L1 MUST | `gateway:check, delivery:check` | every CI run + every release (build-gating) |
| DP-3 | Retention/deletion policy with enforcement evidence | L2 | `file-exists` | every CI run (reported, non-gating) |
| OB-1 | SLOs/health + alerts for core subsystems | L1 MUST | `observability:check` | every CI run + every release (build-gating) |
| OB-2 | Permission-gated signed dispatch; hashed SIEM events | L1 MUST | `alerts:check` | every CI run + every release (build-gating) |
| OB-3 | One live delivery path proven against a real external collector | L2 | `delivery:execute-check` | every CI run (reported, non-gating) |
| ML-1 | Model routing declares provider/route/credential posture | L1 MUST | `gateway:check` | every CI run + every release (build-gating) |
| ML-2 | Cost/token/latency guardrails; live-budget needs approval | L1 MUST | `cost:check` | every CI run + every release (build-gating) |
| ML-3 | Tool registration records write-scope and approval class | L2 | `tools:check` | every CI run (reported, non-gating) |
| SC-1 | Automated CI gate runs conformance suite | L1 MUST | `ci-workflow-present` | every CI run + every release (build-gating) |
| SC-2 | No secrets in tracked source; dependency posture reviewable | L1 MUST | `secret-scan` | every CI run + every release (build-gating) |
| SC-3 | Signed/attested, reproducible releases | L2 | `release:check` | every CI run (reported, non-gating) |
| HX-7 | De-identification enforces one of two lawful HIPAA methods | L1 MUST | `health:check` | every CI run + every release (build-gating) |
| HX-8 | FDA Non-Device CDS four-criterion device-track router | L1 MUST | `health:check` | every CI run + every release (build-gating) |
| HX-1-6 | HIPAA control posture (BA, unique-user, break-glass, audit, integrity) | L1 MUST | `health:check` | every CI run + every release (build-gating) |
| HX-RUN | Persisted health run loop: create -> RBAC-gated signed approval -> hash-chained ledger -> evidence, survives reload, no PHI persisted | L1 MUST | `health:runs-check` | every CI run + every release (build-gating) |
| HX-9-11 | HIPAA Security Rule NPRM forward controls (encryption/MFA/asset-inventory) [NPRM-2025, proposed] | L2 | `health:forward-check` | every CI run (reported, non-gating) |
| HX-12 | ONC HTI-1 predictive DSI transparency (31 source attributes + IRM + access) [in-force 2025-01-01] | L1 MUST | `health:check` | every CI run + every release (build-gating) |
| HX-13 | CMS prior-auth + MA AI: specific denial reason, individualized assessment, no algorithm-only denial [in-force] | L1 MUST | `health:check` | every CI run + every release (build-gating) |
| HX-14 | 42 CFR Part 2 SUD consent + accompanying notice + proceedings block + provenance [in-force 2026-02-16] | L1 MUST | `health:check` | every CI run + every release (build-gating) |
| HX-17a | CA AB 3030 / SB 1120: patient AI disclosure + human medical-necessity decision [in-force 2025-01-01] | L1 MUST | `health:check` | every CI run + every release (build-gating) |
| HX-17b | Colorado AI Act (SB24-205) high-risk duties [future, operative 2026-06-30] | L2 | `health:forward-check` | every CI run (reported, non-gating) |
| HX-18 | EU AI Act high-risk medical AI [future: Annex III 2026-08-02 / Annex I medical 2027-08-02] | L2 | `health:forward-check` | every CI run (reported, non-gating) |
| HX-15 | NIST 800-66r2 HIPAA->CSF/800-53 evidence + AI RMF function coverage + AI 600-1 GAI risk coverage [voluntary framework] | L2 | `health:frameworks-check` | every CI run (reported, non-gating) |
| HX-16 | CHAI Applied Model Card completeness evaluator (Draft V0.1) [voluntary framework] | L2 | `health:frameworks-check` | every CI run (reported, non-gating) |

