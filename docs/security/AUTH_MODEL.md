# SentinelOps AI Auth Model

## Modes

SentinelOps supports three identity modes:

| Mode | Purpose | Actor Source |
| --- | --- | --- |
| `local-dev` | Stable local portfolio demo | Reviewer body fields or `x-sentinelops-*` headers |
| `jwt` | Local gateway or shared-secret pilot integration | HS256 bearer-token claims |
| `oidc` | Enterprise identity-provider integration | RS256 bearer-token claims verified through JWKS |

`local-dev` is the default so the dashboard remains usable without an identity provider. `jwt` mode is enabled with:

```bash
SENTINELOPS_AUTH_MODE=jwt
SENTINELOPS_AUTH_JWT_SECRET=<shared-dev-or-gateway-secret>
SENTINELOPS_AUTH_ISSUER=<expected-issuer>
SENTINELOPS_AUTH_AUDIENCE=<expected-audience>
```

`oidc` mode is enabled with:

```bash
SENTINELOPS_AUTH_MODE=oidc
SENTINELOPS_AUTH_JWKS_URL=https://idp.example.test/.well-known/jwks.json
SENTINELOPS_AUTH_ISSUER=<expected-issuer>
SENTINELOPS_AUTH_AUDIENCE=<expected-audience>
SENTINELOPS_AUTH_JWKS_CACHE_MS=300000
```

The JWKS URL must use HTTPS except for localhost smoke tests. The verifier accepts only RS256 keys marked for signing and rejects unknown `kid` values.

## Role Mapping

JWT and OIDC modes map a token to the same RBAC roles enforced by `server/rbac.mjs`.

Explicit role claims:
- `sentinelops_role`
- `role`

Default group mapping:

| Group | SentinelOps Role |
| --- | --- |
| `sentinelops-security-reviewers` | `security-reviewer` |
| `sentinelops-compliance-analysts` | `compliance-analyst` |
| `sentinelops-auditors` | `auditor` |
| `sentinelops-operators` | `operator` |

Group claim search order:
- `sentinelops_groups`
- `groups`
- `roles`
- `cognito:groups`

Override the mapping with `SENTINELOPS_AUTH_GROUP_ROLE_MAP` as JSON.

## Protected Operations

Server-side auth is applied before RBAC checks for:

- creating assessment runs;
- approving or denying gates;
- rerunning eval packs;
- running agent reviews;
- exporting evidence packets.

The browser role selector is only authoritative in `local-dev` mode. In `jwt` and `oidc` modes, role and reviewer identity are derived from verified token claims.

## Verification

Run:

```bash
npm run auth:check
npm run auth:oidc-check
```

The JWT smoke test starts the API in shared-secret mode and proves:

- anonymous mutation is blocked;
- requests without bearer tokens are rejected;
- auditor tokens cannot approve;
- security-reviewer group tokens can approve;
- the approval ledger records reviewer name and mapped role from token claims.

The OIDC smoke test starts a local JWKS endpoint, starts the API in `oidc` mode, and proves:

- RS256 JWKS verification is active;
- unknown signing-key IDs are rejected;
- OIDC groups map to SentinelOps RBAC roles;
- lower-privilege reviewer tokens cannot approve;
- security-reviewer tokens can approve and are recorded in the ledger.
