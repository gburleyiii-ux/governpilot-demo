# GovernPilot AI Governance Standard (GAGS)

**Document ID:** GAGS-CORE
**Version:** 0.1.0 (Draft for Review)
**Status:** Draft — not yet ratified, not a federal authorization
**Date:** 2026-06-18
**Editor of record:** GovernPilot (engine codename: SentinelOps)

> **Truthful boundary (normative for this document itself):** This is a candidate
> standard authored by a single vendor. It is **not** a NIST publication, a FedRAMP
> authorization, or an OMB-endorsed requirement. It is engineered to *map onto* those
> frameworks so that an implementation conforming to GAGS produces the evidence those
> processes require.

---

## 1. Purpose and Scope

GAGS defines the **minimum verifiable controls** an AI governance control plane MUST
provide to operate **agentic AI** (AI that can call tools, take actions, or write to
systems) in regulated and government environments.

GAGS governs the **control plane**, not the model. It answers: *before this AI is
allowed to act, what must be true, who approved it, what policy applied, what was
tested, and what tamper-evident evidence proves it.*

**In scope:** approval authority, policy-as-code, evaluation/safety gating, audit
evidence integrity, identity/RBAC, data boundaries, observability, model/tool lifecycle,
deployment integrity.

**Out of scope:** model training methodology, model weights provenance (referenced, not
specified), and any control that cannot be objectively verified by an assessor.

GAGS is **implementation-neutral**: any system (not only GovernPilot) MAY claim
conformance by passing the conformance suite in `CONFORMANCE` (§6).

## 2. Conformance Conventions

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be
interpreted as in RFC 2119 / RFC 8174.

A requirement is **verifiable** only if this document names the objective evidence that
demonstrates it (the *Verification* line). Requirements without verification are
non-normative guidance and are marked *(informative)*.

## 3. Normative References

GAGS requirements crosswalk to (and are designed to generate evidence for):

- **NIST AI RMF 1.0** (AI Risk Management Framework: Govern / Map / Measure / Manage)
- **NIST AI 600-1** (Generative AI Profile)
- **NIST SP 800-53 Rev. 5** (Security and Privacy Controls)
- **FedRAMP** (baseline control selection and continuous monitoring)
- **OMB M-24-10** and successor AI memoranda (federal agency AI use, minimum practices for rights- and safety-impacting AI)
- **NIST SP 800-218 (SSDF)** (secure software development)
- **CMMC 2.0** (for the defense-industrial-base supply chain)
- **NIST SP 800-63** (digital identity / authenticator assurance)

A full requirement→control crosswalk is maintained in `standard/crosswalk.json`.

## 4. Definitions

- **Control plane** — the system that authorizes, gates, records, and proves AI actions.
- **Write-capable action** — any tool/agent action that changes external state.
- **Approval gate** — a control point that blocks write-capable actions until an
  authorized human decision is recorded.
- **Evidence packet** — a content-addressed, signed bundle proving a run's controls.
- **Audit ledger** — an append-only, hash-chained record of governance decisions.
- **Conformance level** — L1/L2/L3 as defined in §5.
- **Truthful boundary** — an explicit, machine-readable disclosure of what an
  implementation does **not** do (e.g., "not FedRAMP authorized," "no live model").

## 5. Conformance Levels

| Level | Name | Intent | Gate |
|---|---|---|---|
| **L1** | Foundational | The control logic exists and is correct in a single-tenant deployment | All §7 **MUST** pass in the conformance suite |
| **L2** | Managed | Operated as a real service: persistent ledger, real identity, multi-tenant isolation, continuous monitoring | L1 + all §7 **SHOULD** + persistence/identity/tenancy requirements (IA, DP, OB families) demonstrated against live infrastructure |
| **L3** | Authorized | Independently assessed against a FedRAMP/agency baseline with an accepted authorization package | L2 + 3PAO assessment + ATO/authorization artifacts (§8) |

An implementation MUST publish its claimed level and its **truthful boundary**. Claiming
a level not substantiated by the conformance report is a conformance violation.

GovernPilot's reference implementation today is **L1-targeting** with a local backend.
Tenant isolation (IA-4) is enforced and tested (`tenancy:check`), so runs, approvals, and
evidence are scoped per tenant; full L2 still requires the remaining persistence/identity
items demonstrated against live infrastructure. This is stated, not hidden — see `CONFORMANCE`.

## 6. Conformance Assessment

Conformance is demonstrated by the **machine-checkable conformance suite**:
`npm run conformance` (driver: `scripts/verify-conformance.mjs`), which maps every
normative requirement ID to one or more executable checks and emits a signed
`conformance-report.json`. A requirement is **Pass**, **Fail**, or **Not-Applicable**
(with stated reason). No requirement may be reported Pass without a referenced check.

Self-assessment is sufficient for L1. L2 requires evidence from live infrastructure.
L3 requires an independent assessor.

---

## 7. Normative Requirements

Each requirement: **ID | Level | Statement | Verification | Crosswalk**.

### 7.1 Governance & Accountability (GA)

- **GA-1** *(L1, MUST)* — Every governed AI action MUST be associated with a uniquely
  identified **run** that records the workflow, environment, and responsible owner.
  *Verification:* run object contains `id`, `workflow`, `environment`, `owner`.
  *Crosswalk:* AI RMF GOVERN-1; 800-53 AU-3.
- **GA-2** *(L1, MUST)* — The system MUST NOT auto-enforce policy changes; activation of
  a policy or write-capable capability MUST require a recorded human decision.
  *Verification:* `smoke-rbac`, `smoke-policy-intelligence` (no-auto-enforce assertion).
  *Crosswalk:* AI RMF MANAGE-1; OMB M-24-10 minimum practices (human oversight).
- **GA-3** *(L2, SHOULD)* — Roles and responsibilities (RACI) for approval, audit, and
  operation MUST be documented and enforced by RBAC (§7.6).

### 7.2 Human Approval & Authority (HA) — *from `tool-approval-standard`*

- **HA-1** *(L1, MUST)* — Write-capable actions MUST be blocked until an authorized
  approver records an explicit approve/deny decision (approval-before-write).
  *Verification:* `smoke-api` happy path + `smoke-rbac` denial path.
  *Crosswalk:* AI RMF MANAGE-2; 800-53 AC-3, AC-6.
- **HA-2** *(L1, MUST)* — An action MUST be blocked if required evidence is missing.
  *Verification:* eval-gate missing-evidence case in `evals/run-local`.
- **HA-3** *(L1, MUST)* — Approval and denial decisions MUST be cryptographically signed
  and bound to the run (§7.5).
  *Verification:* `smoke-audit-integrity` signature check.
- **HA-4** *(L1, MUST NOT)* — A role without approval permission MUST NOT be able to
  approve a gate (no privilege escalation via API).
  *Verification:* `smoke-rbac` auditor/operator denial.

### 7.3 Policy-as-Code & Source Provenance (PC) — *from `retrieval-policy-standard`*

- **PC-1** *(L1, MUST)* — Active policy MUST be expressed as inspectable, declarative
  rules (not opaque code paths) and be exportable for independent review.
  *Verification:* `/api/policies/as-code`, `smoke-policy-as-code`.
  *Crosswalk:* AI RMF MAP-1; 800-53 CM-2.
- **PC-2** *(L1, MUST)* — Policy decisions MUST be exportable to a portable policy format
  (OPA/Rego) without unsupported conditions silently dropped.
  *Verification:* `smoke-rego-compat` (zero unsupported conditions).
- **PC-3** *(L1, MUST)* — Every policy/governance citation MUST reference a registered
  source with provenance (origin, retrieval basis).
  *Verification:* retrieval index returns sourced citations; `smoke-retrieval`.
  *Crosswalk:* AI RMF MEASURE-2 (explainability of governance basis).
- **PC-4** *(L2, SHOULD)* — Source registry changes SHOULD be change-reviewed and
  versioned with provenance retained.

### 7.4 Evaluation & Safety Gating (EG) — *from `eval-gate-standard`, `prompt-injection-standard`*

- **EG-1** *(L1, MUST)* — Agentic deployments MUST pass a regression suite covering at
  minimum: approval-before-write, missing-evidence blocking, denied-action blocking, and
  rollback-evidence checks, before entering controlled pilot.
  *Verification:* `evals/run-local` (all cases pass).
  *Crosswalk:* AI RMF MEASURE-2/MEASURE-3; AI 600-1 (GAI evaluation).
- **EG-2** *(L1, MUST)* — A failing or watch-status safety eval (hallucination, policy
  compliance, tool safety) MUST block tool activation until mitigated.
  *Verification:* eval health gate in `sentinelEngine` / `smoke-api`.
- **EG-3** *(L1, MUST)* — Prompt-injection and retrieval-drift red-team cases MUST cause
  an otherwise-approved run to be blocked when they fail.
  *Verification:* red-team cases in `evals/run-local`.
  *Crosswalk:* AI 600-1 (prompt injection); AI RMF MANAGE-2.
- **EG-4** *(L2, SHOULD)* — Eval results MUST be attached to the run's evidence packet and
  linked to the current run trace.

### 7.5 Audit Evidence & Integrity (AE) — *from `audit-evidence-standard`*

- **AE-1** *(L1, MUST)* — Governance decisions MUST be recorded in an append-only,
  hash-chained audit ledger; any tampering MUST be detectable.
  *Verification:* `smoke-audit-integrity` tamper-detection case.
  *Crosswalk:* 800-53 AU-9 (protection of audit information); AI RMF GOVERN-4.
- **AE-2** *(L1, MUST)* — Evidence packets MUST be content-addressed (hashed) and the
  manifest hash MUST cover all included artifacts.
  *Verification:* manifest hash check in `smoke-api`.
- **AE-3** *(L1, MUST)* — Record signatures MUST use a keyed algorithm whose key is
  **not** a shipped default in any non-development mode; the system MUST refuse to operate
  in production without an externally provided signing secret, **or** MUST clearly mark
  records as development-signed.
  *Verification:* `smoke-signing-guard` (NEW — production boot refusal / dev-mode label).
  *Crosswalk:* 800-53 SC-12/SC-13 (key management), AU-10 (non-repudiation).
- **AE-4** *(L1, MUST)* — A full audit export MUST be producible on demand, gated by
  export permission, including run inventory, dataset/evidence hashes, and an export hash.
  *Verification:* `/api/audit/export` permission gate + hash presence.

### 7.6 Identity, Access & RBAC (IA)

- **IA-1** *(L1, MUST)* — Every mutating endpoint MUST enforce a permission check; default
  posture MUST be deny.
  *Verification:* `smoke-rbac`; endpoint-gate inventory in conformance report.
  *Crosswalk:* 800-53 AC-3, AC-6; AAL per 800-63.
- **IA-2** *(L1, MUST)* — Authentication MUST verify token integrity: signature, issuer,
  audience, and expiry; `alg=none` and algorithm-confusion MUST be rejected.
  *Verification:* `smoke-auth`, `smoke-oidc` (RS256/JWKS, kid rejection).
  *Crosswalk:* 800-63B.
- **IA-3** *(L2, SHOULD)* — Identity SHOULD federate to an agency-approved IdP (OIDC/JWKS)
  and map IdP groups to GAGS roles.
- **IA-4** *(L2, MUST for L2)* — In multi-tenant operation, a tenant MUST NOT read or
  approve another tenant's runs, policies, or evidence (isolation).

### 7.7 Data Protection & Boundaries (DP)

- **DP-1** *(L1, MUST)* — The system MUST declare a machine-readable data boundary stating
  what categories of data it does and does not store/transmit.
  *Verification:* `/api/data-protection`, `smoke-data-protection`.
  *Crosswalk:* 800-53 SC-7; OMB privacy requirements.
- **DP-2** *(L1, MUST NOT)* — Secrets (signing keys, provider credentials, tokens) MUST
  NOT appear in any API response, evidence packet, log, or exported artifact.
  *Verification:* secret-non-disclosure assertions across delivery/gateway smoke tests.
- **DP-3** *(L2, SHOULD)* — Data retention and deletion MUST follow a stated policy with
  evidence of enforcement.

### 7.8 Observability & Incident Response (OB)

- **OB-1** *(L1, MUST)* — The system MUST compute SLOs/health for ledger, eval, policy,
  retrieval, and audit subsystems and surface alerts on degradation.
  *Verification:* `smoke-observability` (healthy + tamper-triggered alert).
  *Crosswalk:* 800-53 SI-4, AU-6.
- **OB-2** *(L1, MUST)* — Alert dispatch MUST be permission-gated and produce signed
  dispatch records; SIEM events MUST be hashed.
  *Verification:* `smoke-alert-routing`.
- **OB-3** *(L2, SHOULD)* — At least one live delivery path (SMTP/Slack/webhook/SIEM)
  SHOULD be demonstrated against a real external collector, not only localhost.

### 7.9 Model & Tool Lifecycle (ML)

- **ML-1** *(L1, MUST)* — Model routing MUST declare provider, route, and credential
  posture; routes lacking credentials MUST be reported as not-ready, not silently used.
  *Verification:* `smoke-model-gateway`.
- **ML-2** *(L1, MUST)* — Cost/token/latency guardrails MUST be evaluable and a
  live-budget route MUST require approval.
  *Verification:* `smoke-cost-guardrails`.
- **ML-3** *(L2, SHOULD)* — Tool registration SHOULD record each tool's capability,
  write-scope, and required approval class.

### 7.10 Supply Chain & Deployment Integrity (SC)

- **SC-1** *(L1, MUST)* — Build and release MUST run an automated gate (CI) that executes
  the conformance suite; a failing gate MUST block release.
  *Verification:* `.github/workflows` present and runs `npm run conformance`.
  *Crosswalk:* SSDF (PS/PW), 800-53 CM-3/SA-11.
- **SC-2** *(L1, MUST)* — Deployed artifacts MUST NOT contain secrets; dependency posture
  MUST be reviewable.
  *Verification:* secret scan + `npm audit` surface in conformance report.
- **SC-3** *(L2, SHOULD)* — Releases SHOULD be signed/attested and reproducible.

---

## 8. Authorization Artifacts (L3, informative)

For L3 an implementation assembles: System Security Plan (SSP) with GAGS→800-53 control
implementation statements (generated from `standard/crosswalk.json`), POA&M, threat model
(`docs/security/THREAT_MODEL.md`), incident response plan, continuous-monitoring plan, and
the 3PAO assessment results. GAGS conformance evidence is designed to be the technical
backbone of this package — it does **not** replace the authorization process.

## 9. Governance of This Standard

GAGS is versioned semantically; conformance is self-asserted and reproducible via the open conformance suite and TCK in this repository.

## 10. Conformance Claim Template

> *Implementation X claims **GAGS v0.1.0 Level L_** conformance as of *date*, evidenced by
> `conformance-report.json` (hash: …). Truthful boundary: _______. Unverified items: _______.*
