# SentinelOps AI Incident Response Plan

This plan covers pilot and portfolio operations. It does not replace a customer incident response plan.

## Incident Types

- Sensitive data uploaded into SentinelOps.
- Secret, token, or key detected in request content.
- Unapproved policy source or customer policy text added.
- Unauthorized approval or evidence export attempt.
- Live delivery misconfiguration.
- Public deployment exposes non-public runtime state.
- Dependency, hosting, or credential compromise.

## Severity

| Severity | Definition | Initial Response |
| --- | --- | --- |
| Critical | classified data, CUI, PHI, PII, secret, or customer-sensitive data exposure | stop processing, isolate, notify owner |
| High | unauthorized approval, export, or live delivery path | disable path, preserve logs, review RBAC |
| Medium | policy-source drift, false positive, missing evidence | open finding, correct, retest |
| Low | documentation or workflow issue | backlog and fix |

## First 30 Minutes

1. Stop the affected workflow or service.
2. Preserve audit evidence without copying sensitive payloads.
3. Identify data category and affected environment.
4. Notify Grant and the named customer security owner if a customer pilot is involved.
5. Rotate exposed credentials if any secret may have been present.

## First 24 Hours

1. Complete event timeline.
2. Identify root cause.
3. Confirm whether sensitive data was persisted.
4. Delete unapproved data where allowed and document deletion.
5. Patch controls or update policy.
6. Rerun relevant checks.
7. Produce customer-facing summary if contractually required.

## Evidence To Preserve

Preserve safe metadata:

- timestamps;
- route or workflow name;
- actor role;
- control decision;
- finding category;
- remediation action;
- hash of evidence package if safe.

Do not preserve raw sensitive values unless counsel and the security owner require it under an approved evidence-handling process.

## Verification After Remediation

Run:

```bash
npm run data:check
npm run hardening:check
npm run auth:check
npm run audit:check
npm run deployment:check
```

## External Communication

Do not send incident details externally until the customer security owner, counsel, and Grant approve the message.
