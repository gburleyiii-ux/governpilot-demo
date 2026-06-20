# SentinelOps AI Security Audit

This audit is a readiness artifact for real-world testing. It does not claim FedRAMP authorization, agency approval, penetration-test completion, or production accreditation.

## Current Strengths

- Server-enforced RBAC for approval, denial, eval, agent review, evidence export, settings, and alert routing actions.
- Local, JWT, and OIDC/JWKS auth modes are documented and smoke-tested.
- Approval records are signed with a tamper-evident previous-hash chain.
- Evidence manifests include packet hashes, section hashes, and ledger verification.
- Model gateway, retrieval, live delivery, and policy intelligence endpoints do not return raw credentials.
- Live alert delivery fails closed unless approval and provider configuration are present.
- Node service now adds baseline security headers: `Content-Security-Policy`, `Cross-Origin-Opener-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- Browser CORS is allowlist-driven through `SENTINELOPS_CORS_ORIGINS`; local origins are the only defaults and wildcard CORS is not used unless explicitly configured.
- JSON body parsing is capped by `SENTINELOPS_MAX_JSON_BYTES`, defaulting to 1 MiB, and returns `413` before mutation work for oversized requests.
- Mutating JSON requests are inspected by the pilot data boundary before authorization or persistence; high-confidence sensitive data patterns return `422` without echoing raw values.
- Static public hosting fails closed for `/api/*`.

## Real-World Testing Controls

- Use synthetic, public, or customer-approved test data only.
- Do not upload classified, CUI, PHI, PII, export-controlled, or contract-restricted content during first tests.
- Run in a customer-controlled private environment for contractor pilots.
- Configure OIDC/JWKS before multi-user testing.
- Set production CORS allowlist before browser access outside localhost.
- Configure production log retention and evidence export destination before pilot decisions are recorded.
- Treat the public Netlify deployment as portfolio material only, not a customer runtime.
- Run `npm run data:check` before any customer-facing pilot demo or private deployment.

## Gaps To Close Before Production

- External penetration test.
- Dependency and container image vulnerability scan.
- Formal threat-model review with customer security owner.
- Production CORS origin allowlist.
- Confirm final CSP/HSTS posture with the deployment owner before using custom domains, especially if subdomains must opt out of preload behavior.
- Secrets manager integration and rotation runbook.
- Customer identity provider group mapping.
- Backup and recovery test for state and evidence stores.
- Legal/compliance approval for policy sources and active policy interpretations.
- Customer-approved retention and deletion schedule.
- Incident response tabletop exercise.

## Verification Commands

```bash
npm run auth:check
npm run auth:oidc-check
npm run hardening:check
npm run data:check
npm run policy:check
npm run policy:intel-check
npm run audit:check
npm run delivery:check
npm run delivery:execute-check
npm run delivery:api-check
npm run deployment:check
```
