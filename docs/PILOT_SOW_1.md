# Pilot SOW #1 (DRAFT) - GovernPilot Design Partner

Status: DRAFT for Zeus review - NOT for outreach.
Provider: Booman Systems LLC (Grant Burley III). Customer: TBD (do not invent).
Term: 90 days. Target price: $36,000 (list target, not revenue; zero customers today).

## Scope (included)
- Governed control-plane pilot: HITL approval gates, RBAC, hash-chained evidence/export packs.
- Policy mapping labeled self-asserted or mapped (not authorized).
- Deployable non-loopback test demo: jwt or oidc auth; real signing secret via env (not committed).
- Honest PoC disclaimer intact on buyer-facing UI.
- Stripe: test-mode scaffolding only if present; refuse live keys / STRIPE_MODE=live. Payment for SOW #1 may be offline/manual invoice.
- claim:audit remains required on any ship of demo artifacts.

## Excluded (explicit)
- FedRAMP ATO, 3PAO assessment, agency sponsor/authorization.
- CMMC certification.
- DISA/NMSC overlapping bid work while Grant is at eSimplicity.
- Live Stripe / live money / card Checkout charging real funds.
- Any claim of customers, ARR, or production accreditation.

## Acceptance (verifiable)
1. Demo boots off-loopback only with jwt|oidc + non-dev signing secret; local-dev refused.
2. Buyer UI shows readiness/maps-toward language; no FedRAMP/CMMC-as-authorized overread; claim:audit PASS.
3. Evidence export requires authenticated actor with export_evidence posture.
4. Written handoff pack: SOW, env template (no secrets), runbook for test demo.

## Commercial notes
Target Pilot $36k/90d is a list target. Zero paid pilots until signed + paid. Control Plane $72k/yr and Enterprise $120k/yr are separate targets, out of scope for SOW #1 unless amended.

## Next (internal)
Zeus review. No outreach until Zeus asks. Sync to StudioSSD governpilot-demo/docs/ when Mac is back.
