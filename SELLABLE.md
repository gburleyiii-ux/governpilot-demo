# SELLABLE.md - GovernPilot / SentinelOps

Owner: Atlas (eng lead). Orchestrator: Zeus.
Source: StudioSSD projects-home/governpilot-demo @ 59e4e31 (+ sentinelops-ai). GitHub Cursor app missing - CloudAgent/PR blocked.
Updated: 2026-09-02. Status: v2.2 - H3 test-only scaffolding + /pricing UI landed (uncommitted). Push blocked on gh device login. C1+H2+H11+H12 PASS. No live money.

Aegis: C1+H2+H11+H12 PASS (StudioSSD verified). Residual = uncommitted/unpushed until GitHub/Cursor commit path. H3 still before any live Stripe. No buyer/pilot overclaim.

## Hard facts (do not soften)

- Zero customers. Zero paid pilots. List prices (Pilot $36k/90d; Control Plane $72k/yr; Enterprise $120k/yr) are targets, not ARR.
- No FedRAMP ATO, no 3PAO, no agency sponsor, no CMMC certification, no DISA/NMSC bid language while Grant is at eSimplicity.
- Product today = proof-of-work / pilot-readiness demo. Not production-accredited.

## What works today (honest)

- Local deterministic demo (API + Vite UI); local-dev auth default
- HITL approval gates + server RBAC; authd POST /api/runs; jwt/oidc required off-loopback
- Hash-chained audit/evidence; signing-guard; dev signing key OK only on loopback
- GAGS L1/L2 + TCK self-asserted; NIST 800-53 crosswalk + SSP gen (generated != authorization)
- Policy-as-code + OPA/Rego; eval harness; GovCloud terraform skeleton (no OIDC task-def yet)
- Honest PoC disclaimer in App.tsx ~1206

## Ship blockers - severity-ranked (v1)

### C1 - Critical - PASS (Aegis) - Owners: Bolt + Relay

**Residual (Bolt):** jwt boot refuses empty SENTINELOPS_AUTH_JWT_SECRET; oidc boot refuses missing JWKS/issuer/audience. auth:guard-check PASS (10/10).

Gap: local-dev auth must not boot for non-loopback / production-like envs. Fail-closed to jwt or oidc. Mirror server/signing-guard.mjs posture (isLoopbackHost / isProductionLikeEnv).

Current state (Bolt + Relay, 59e4e31):
- signing-guard fail-closes prod-like for HMAC; auth.mjs still defaults local-dev with no boot mirror. Boot only asserts signing.
- Scripts auth:check / auth:oidc-check exist; .github/workflows/conformance.yml runs signing:check + conformance/health/evals/TCK - not those two.
- Docker/docker-compose set NODE_ENV=production + SENTINELOPS_API_HOST=0.0.0.0 with no SENTINELOPS_AUTH_MODE / JWKS / JWT secret - auth still defaults local-dev.
- Infra terraform: no task-def OIDC+JWKS env wiring found this pass.

Done bar: auth posture assert at boot + smoke + CI auth gates (both checks); non-loopback/prod image refuse without jwt|oidc; task def OIDC+JWKS when we deploy. Zeus authorized StudioSSD patch while GitHub CloudAgent blocked.

### H2 - High - PASS (Aegis) - Owners: Gauge (blocks) + Pixel (UI) + Bolt (seed/server) + Atlas (seed/docs)

Gap: Claim-lock FedRAMP/CMMC UI chips, seed env strings, SSP/policy language. Rename to readiness / maps-toward. Mapping != authorization.

Pixel + Gauge feed (OPEN on buyer surfaces):
- Critical: Seed environment "FedRAMP High / AWS GovCloud target" - src/data/seed.ts, server/seed.mjs, state JSON (+ sentinelops-ai parity)
- High: overviewFrameworks bare FedRAMP/CMMC chips - App.tsx ~2821; rename to readiness mapping
- High: policy-as-code.json framework "NIST AI RMF / FedRAMP pilot controls" via activePolicy?.framework - App.tsx ~3475
- High: HIPAA BA / FDA Non-Device CDS buyer copy without BAA - App.tsx ~242, ~881, ~977, ~3660; voluntary / not legal advice
- High: Health segment chip "FedRAMP/OMB (via core)" ~888; maps-toward only
- Med: Header GovCloud pilot chip; DISA STIG watchlist label; Approve copy "Approved for controlled pilot" / Controlled pilot
- Low: Seed cost $ strings - prefix Demo estimate (not ARR)
- Clear: PoC disclaimer present; README + CURATION_NOTE honest; no signup/pricing/list-price/Stripe UI - do not invent live payments

Evidence bar (Gauge): every FedRAMP/CMMC/DISA/HIPAA/customer/ARR statement needs (a) primary artifact path, (b) status label self-asserted|mapped|voluntary|authorized, (c) explicit non-claim if not authorized.
Done bar (Pixel): strip chips + BA overread to readiness language; seed string with Atlas. StudioSSD patch authorized.

### H11 - High - PASS (Aegis) - Owners: Bolt + Gauge

Gap: Unauth state write via GET: GET /api/runs/latest -> ensureLatestRun() can create run+audit with no actor/RBAC (POST /api/runs is authd).
Done bar: auth+create_run before create, or latest read-only never creates.

### H12 - High - PASS (Aegis) - Owners: Bolt + Gauge

Gap: Unauth audit read: GET /api/runs/:id/audit returns approvals/policyChecks/agentReviews/auditEvents tenant-scoped only; no resolveRequestActor / exportEvidence (unlike evidence-manifest/bundle/export).
Done bar: same authz as evidence exports (resolveRequestActor + export_evidence posture).

### H3 - High - SCAFFOLDING LANDED (uncommitted) - TEST ONLY / refuse live - Owners: Relay + Bolt (+ Gauge; Pixel /pricing done)

Gap: Stripe absent (zero Stripe code/deps; no Stripe UI). When adding: STRIPE_MODE=test only; refuse live keys and STRIPE_MODE=live; webhook verify in test; no committed keys. Do not fake live payments. Grant hard lock this pass: refuse live entirely (no owner-flag bypass).
Current: keep labeled absent. Pilot SOW #1 can be offline/manual invoice.

## Next (post-blocker)
- M4 Med: Expand CI hardening/tenancy/delivery/release checks - Relay (+ Gauge gate)
- M5 Med: local-dev HMAC deploy alert - Bolt + Relay
- M6 Med: Require TLS for GovCloud ALB pilots - Relay

## Missing for paying pilot ($36k / 90d design-partner SOW)
Must close before non-loopback paid demo: C1, H2, H11, H12, deployable jwt|oidc demo (Relay), honest pilot UX no invented signup/pricing (Pixel), SOW excludes ATO.
Nice-to-have for SOW #1: H3 Stripe (manual invoice OK), M4-M6, full customer IdP OIDC (jwt may suffice early).

## Path to first $36k design-partner SOW
1. Close C1 + H2 + H11 + H12 (StudioSSD patch authorized; Aegis re-gates).
2. Deployable demo on non-prod host with jwt|oidc, real signing secret, TLS plan (M6 for GovCloud).
3. SOW language (honest): 90-day design partner - governed control-plane pilot, evidence/export packs, policy mapping, HITL workflows; deliverables labeled self-asserted/mapped; excludes FedRAMP ATO, CMMC cert, agency authorization.
4. Price: target Pilot $36k/90d. Zero revenue until signed + paid.
5. Ops lock: no overlapping DISA/NMSC bids while Grant is at eSimplicity.

## Owners summary
- Atlas: SELLABLE.md, architecture, roadmap, PR review; seed/docs claim-lock with Pixel
- Bolt: C1 auth fail-closed; H11; H12; H2 seed/server; H3 Stripe server; M5
- Pixel: H2 buyer-facing claim strip; honest pilot UX (no invented checkout)
- Relay: C1 CI auth:check + auth:oidc-check; Docker/prod auth refuse; H3 Stripe env; M4-M6
- Gauge: H2 claim-audit gate + H11/H12 verify (can BLOCK); evidence bar

## Execute status (eng only)
- SELLABLE v2.1: Grant GO via Zeus (2026-09-02).
- Commit/push: Relay+Bolt own StudioSSD dirty tree (C1/H2/H11/H12 + claim:audit + Docker/TF). Atlas PR-reviews if PR opens. No secrets in commit.
- **Grant hard lock:** No live money. Stripe **test mode only**. Refuse STRIPE_MODE=live and live keys for this entire pass. No owner-flag bypass unless Zeus brings a fresh Grant yes later.
- H3: test-mode-first scaffolding — STRIPE_MODE=test only, webhook verify in test, secrets/env only, no committed keys. Gauge: claim:audit stays required + Stripe mode gate smoke (test-only / refuse live). Pixel: signup/pricing after test scaffolding; list prices as targets not revenue.
- C1+H2+H11+H12 Aegis PASS held. No buyer/pilot overclaim. Facts to Zeus.
