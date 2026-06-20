# GAGS L2 Live-Infrastructure Deployment Plan

**Goal:** move L2 from *demonstrated against a local backend* (today) to *proven against
live infrastructure* — the program plan's L2 exit criteria. This is a plan/runbook; it is
**not executed here**. Steps marked 🟡 incur cloud cost or are owner-gated; nothing below
runs without Grant's approval.

## Where L2 stands today

All 14 L2 requirements pass the conformance suite, but against a **local JSON backend** and
local collectors. The reference report states this plainly. The honest gaps to "live L2":

| L2 requirement | Today | Live-L2 target |
|---|---|---|
| IA-4 tenant isolation | enforced + tested locally | same code, multi-tenant on deployed datastore |
| IA-3 agency IdP federation | OIDC/JWKS verified in tests | federated to a real agency IdP tenant 🟡 |
| OB-3 live delivery | proven vs localhost collectors | one live delivery vs a real external collector 🟡 |
| DP-3 retention/deletion | documented + enforced locally | enforced on managed datastore 🟡 |
| persistence (AE/IA families) | local-json store | managed Postgres/DynamoDB 🟡 |

## Architecture already in place (no new code required)

- **Storage abstraction**: `server/store.mjs` selects an adapter. `SENTINELOPS_STORAGE_ADAPTER=aws`
  switches to `server/storage/aws-state-store.mjs` (S3/DynamoDB via SigV4, no extra SDK).
- **Identity**: `server/auth.mjs` already maps OIDC/JWKS claims/groups → RBAC roles
  (`auth:oidc-check`). Point it at the agency IdP's issuer + JWKS URL.
- **Signing**: `server/signing-guard.mjs` refuses to boot in a production-like env without a
  real `SENTINELOPS_SIGNING_SECRET` (AE-3).
- **Infra skeleton**: `infra/terraform/govcloud/` (GovCloud-ready pilot skeleton).

## Deployment steps (owner-gated)

1. **Provision managed datastore** 🟡 — DynamoDB tables (or Postgres) for state + an S3
   bucket for evidence packets. Wire env: `SENTINELOPS_STORAGE_ADAPTER=aws`, `AWS_REGION`,
   table/bucket names. Cost: recurring.
2. **Deploy the API service** 🟡 — container (`Dockerfile`) to a serverless/container host.
   Set `NODE_ENV=production` + a real `SENTINELOPS_SIGNING_SECRET` (the AE-3 guard enforces this).
3. **Federate identity** 🟡 — set the OIDC issuer/JWKS env to the agency IdP; map IdP groups
   to GAGS roles. Verify with `auth:oidc-check` against the live issuer.
4. **Prove one live external delivery (OB-3)** 🟡 — configure one approved SMTP/Slack/webhook/
   SIEM route to a real collector; execute one permission-gated, signed dispatch; capture the
   signed dispatch record as evidence.
5. **Enforce retention/deletion (DP-3)** 🟡 — apply lifecycle policies on the datastore/bucket;
   capture an enforcement-evidence artifact.

## Verification on live infra (re-run, pointed at the deployment)

- `node tck/run-tck.mjs --base-url https://<deployed>/api --attestation tck/governpilot-attestation.json`
  — the TCK black-box checks now run against live infrastructure.
- `npm run conformance` from a runner with the deployed `SENTINELOPS_API_BASE`.
- Capture the signed conformance report + TCK report from the live environment as the
  **L2 self-assessment** evidence.

## Exit criterion (from the program plan)

> A run created via the UI persists, is retrievable, exports a verifiable evidence packet
> from a deployed environment, and the GAGS L2 self-assessment passes against live
> infrastructure — with one live external delivery proven.

## What this plan cannot do

Deploying, provisioning, and federating incur cost and touch external systems; they are
owner-gated. Independent assessment of the live L2 system (3PAO) and FedRAMP authorization
are separate, external steps.
