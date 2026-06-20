# GAGS-Generated SSP Control-Implementation Statements

Standard: GAGS 0.1.0 · Generated from `standard/crosswalk.json` + `standard/conformance-report.json`.

> **Draft, self-asserted.** Each statement is generated from the GAGS conformance
> evidence. It is an input to a System Security Plan, not an authorization. Independent
> assessment is a separate step.

Controls covered: **34** (NIST SP 800-53 Rev5).

## AC-3 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| HA-1 | Approval-before-write on write-capable actions | Pass | `smoke:api, smoke:rbac` |
| HA-2 | Missing evidence blocks action | Pass | `evals:local` |
| IA-1 | Every mutating endpoint enforces permission; default deny | Pass | `smoke:rbac` |

## AC-4 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| IA-4 | Multi-tenant isolation of runs/policies/evidence | Pass | `tenancy:check` |

## AC-6 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| HA-1 | Approval-before-write on write-capable actions | Pass | `smoke:api, smoke:rbac` |
| IA-1 | Every mutating endpoint enforces permission; default deny | Pass | `smoke:rbac` |

## AC-6(1) — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| HA-4 | No approval-privilege escalation via API | Pass | `smoke:rbac` |

## AC-6(2) — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| HA-4 | No approval-privilege escalation via API | Pass | `smoke:rbac` |

## AU-10 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| HA-3 | Approval/denial decisions signed and bound to run | Pass | `audit:check` |
| AE-3 | No default signing key in production; refuse boot or label dev-signed | Pass | `signing:check` |

## AU-11 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| DP-3 | Retention/deletion policy with enforcement evidence | Pass | `file-exists` |

## AU-3 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| GA-1 | Every governed action bound to an identified run | Pass | `smoke:api` |
| PC-3 | Governance citations reference registered sources | Pass | `retrieval:check` |
| EG-4 | Eval results attached to evidence packet | Pass | `evals:local` |

## AU-6 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| AE-4 | Permission-gated full audit export with export hash | Pass | `audit:check` |
| OB-1 | SLOs/health + alerts for core subsystems | Pass | `observability:check` |
| OB-2 | Permission-gated signed dispatch; hashed SIEM events | Pass | `alerts:check` |
| OB-3 | One live delivery path proven against a real external collector | Pass | `delivery:execute-check` |

## AU-7 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| AE-4 | Permission-gated full audit export with export hash | Pass | `audit:check` |

## AU-9 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| AE-1 | Append-only hash-chained ledger; tamper detectable | Pass | `audit:check` |
| AE-2 | Evidence packets content-addressed; manifest hash covers artifacts | Pass | `smoke:api` |

## AU-9(3) — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| AE-1 | Append-only hash-chained ledger; tamper detectable | Pass | `audit:check` |

## CA-7 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| EG-4 | Eval results attached to evidence packet | Pass | `evals:local` |

## CM-2 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| PC-1 | Active policy is declarative and exportable | Pass | `policy:check` |
| PC-2 | Policy exportable to OPA/Rego with no dropped conditions | Pass | `rego:check` |

## CM-3 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| GA-2 | No auto-enforcement; activation requires recorded human decision | Pass | `smoke:rbac, policy:intel-check` |
| PC-4 | Source registry change-reviewed and versioned | Pass | `policy:intel-check` |
| SC-1 | Automated CI gate runs conformance suite | Pass | `ci-workflow-present` |

## CM-5 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| PC-4 | Source registry change-reviewed and versioned | Pass | `policy:intel-check` |

## CM-6 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| PC-2 | Policy exportable to OPA/Rego with no dropped conditions | Pass | `rego:check` |

## CM-8 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| ML-1 | Model routing declares provider/route/credential posture | Pass | `gateway:check` |
| ML-3 | Tool registration records write-scope and approval class | Pass | `tools:check` |

## IA-2 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| IA-2 | Token integrity verified; alg=none/confusion rejected | Pass | `auth:check, auth:oidc-check` |

## IA-5 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| IA-2 | Token integrity verified; alg=none/confusion rejected | Pass | `auth:check, auth:oidc-check` |

## IA-5(7) — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| DP-2 | Secrets never in responses/evidence/logs/exports | Pass | `gateway:check, delivery:check` |

## IA-8 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| IA-3 | Federate to agency IdP; map groups to roles | Pass | `auth:oidc-check` |

## IR-6 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| OB-2 | Permission-gated signed dispatch; hashed SIEM events | Pass | `alerts:check` |
| OB-3 | One live delivery path proven against a real external collector | Pass | `delivery:execute-check` |

## PM-29 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| GA-3 | Documented RACI enforced by RBAC | Pass | `smoke:rbac` |

## SA-11 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| EG-1 | Pass core regression suite before pilot | Pass | `evals:local` |
| SC-1 | Automated CI gate runs conformance suite | Pass | `ci-workflow-present` |

## SA-15 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| SC-2 | No secrets in tracked source; dependency posture reviewable | Pass | `secret-scan` |

## SC-12 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| AE-3 | No default signing key in production; refuse boot or label dev-signed | Pass | `signing:check` |

## SC-13 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| AE-3 | No default signing key in production; refuse boot or label dev-signed | Pass | `signing:check` |

## SC-28 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| DP-2 | Secrets never in responses/evidence/logs/exports | Pass | `gateway:check, delivery:check` |

## SC-7 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| IA-4 | Multi-tenant isolation of runs/policies/evidence | Pass | `tenancy:check` |
| DP-1 | Declared machine-readable data boundary | Pass | `data:check` |

## SI-12 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| DP-3 | Retention/deletion policy with enforcement evidence | Pass | `file-exists` |

## SI-4 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| OB-1 | SLOs/health + alerts for core subsystems | Pass | `observability:check` |

## SI-7 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| AE-2 | Evidence packets content-addressed; manifest hash covers artifacts | Pass | `smoke:api` |

## SR-4 — Implemented

Implemented by GAGS requirements:

| GAGS | Requirement | Status | Verification |
| --- | --- | --- | --- |
| SC-3 | Signed/attested, reproducible releases | Pass | `release:check` |

