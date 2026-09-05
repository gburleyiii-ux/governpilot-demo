# Deployable test-demo path (non-loopback)

Status: Atlas draft 2026-09-05. Prefer StudioSSD governpilot-demo.
Repo: github.com/gburleyiii-ux/governpilot-demo. Content ~4a55ded; CI 0699387 failed at npm ci (Relay lockfile when Mac back).

## Goal
Non-loopback test demo: jwt|oidc, real signing secret via env, honest PoC disclaimer. No live money. No fake prod/FedRAMP claims.

## Concrete steps
1. SENTINELOPS_AUTH_MODE=jwt|oidc off-loopback; local-dev refused (C1).
2. SENTINELOPS_SIGNING_SECRET env-only; never commit; dev key refused off-loopback.
3. Non-loopback API host only with (1)+(2). Docker/compose refuses unset/local-dev.
4. OIDC: JWKS_URL + ISSUER + AUDIENCE required. JWT: AUTH_JWT_SECRET required.
5. Keep PoC disclaimer; /pricing = list targets; Stripe test-only / refuse live.
6. Before shared URL: auth:guard-check, claim:audit, stripe:guard-check PASS.

## Blockers (honest)
- Mac/StudioSSD offline this turn - cannot verify local boot until Mac reconnects.
- Cursor app not on repo - CloudAgent blocked.
- Hosting target unset (VPS / Fly / Render / AWS non-GovCloud sandbox) - Zeus decision; do not invent prod.
- npm ci lockfile out of sync (hono/express) - Relay when Mac back.

## Next when Mac back
1. Sync PILOT_SOW_1.md + this file to StudioSSD governpilot-demo/docs/.
2. Local verify refuse local-dev on 0.0.0.0; jwt boot with secret off-loopback.
3. After Relay lockfile + green Actions, scope B:T/Relay for host deploy.

## Locks
Stripe TEST ONLY. No buyer outreach. No fake compliance/customers/metrics.
