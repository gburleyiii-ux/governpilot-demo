# SentinelOps AI Data Protection

This document defines the pilot data boundary. It is a security operating artifact, not legal advice.

## Default Rule

SentinelOps pilots use only synthetic, public, or customer-approved non-sensitive data.

The first real-world tests must not process:

- classified data;
- CUI;
- PHI;
- PII;
- payment card data;
- export-controlled data;
- customer-sensitive production data;
- credentials, private keys, bearer tokens, certificates, or API secrets.

## Runtime Enforcement

Mutating JSON API requests pass through `server/data-protection.mjs` before authorization or persistence.

Endpoint:

- `GET /api/data-protection`

Smoke test:

```bash
npm run data:check
```

The guard blocks high-confidence sensitive input patterns and returns only category and JSON field path. It does not return raw sensitive values.

Blocked categories:

- `classified-marker`
- `cui-marker`
- `ssn`
- `payment-card`
- `private-key`
- `api-secret`
- `bearer-token`
- `patient-record`
- `date-of-birth`

## Classification Tiers

| Tier | Allowed In First Pilot | Examples | Handling |
| --- | --- | --- | --- |
| Public | Yes | public policy sources, public website text | Allowed |
| Synthetic | Yes | mock tickets, generated policy examples | Allowed |
| Customer-approved non-sensitive | Yes, with written owner approval | redacted workflow labels, approved policy excerpts | Allowed with evidence |
| Customer confidential | No by default | internal policies, incident summaries, architecture details | Written exception required |
| Regulated sensitive | No | CUI, PHI, PII, export-controlled data | Blocked |
| Classified | No | classified markings or material | Blocked; do not upload |
| Secrets | No | API keys, private keys, bearer tokens | Blocked |

## Exception Process

Any exception requires:

1. written customer approval;
2. named data owner;
3. classification decision;
4. approved private environment;
5. retention and deletion rule;
6. security owner approval;
7. counsel review where required.

## Evidence Boundary

Evidence exports may include:

- approval metadata;
- policy-source metadata;
- provenance hashes;
- eval status;
- audit status;
- safe alert-dispatch metadata.

Evidence exports must not include raw sensitive customer content, credentials, unapproved policy text, or sensitive incident details.

## Operating Position

If the data class is unclear, treat it as not approved and keep it out of SentinelOps until the customer data owner and security owner approve it in writing.
