# SentinelOps AI Retention And Deletion Plan

This plan defines default pilot retention behavior. Customer contracts or legal requirements may override it.

## Default Retention

For first pilots:

- local demo state: delete after demo or within 7 days;
- pilot evidence exports: retain for 30 days after pilot close unless customer approves longer;
- logs: retain only safe operational metadata, not sensitive payloads;
- sales discovery notes: retain only non-sensitive qualification notes;
- customer-provided policy excerpts: delete at pilot close unless the pilot agreement authorizes retention.

## Deletion Triggers

Delete pilot data when:

- customer requests deletion;
- pilot ends and retention window expires;
- data is discovered to be outside the approved boundary;
- legal or security owner instructs deletion;
- a test environment is decommissioned.

## Deletion Procedure

1. Identify state files, evidence exports, logs, screenshots, and working notes.
2. Confirm no legal hold or customer retention obligation exists.
3. Delete local state and evidence artifacts.
4. Delete temporary exports from shared drives or email drafts.
5. Record deletion date, approver, and artifact categories.
6. Notify customer owner if required by agreement.

## Do Not Retain

Do not retain:

- classified data;
- CUI;
- PHI;
- PII;
- payment data;
- secrets;
- customer-sensitive production content;
- unapproved policy text.

## Production Requirement

Before production or sensitive-data pilots, implement:

- customer-approved retention schedule;
- backup retention and purge process;
- evidence export lifecycle policy;
- access reviews;
- deletion attestation process;
- secure log sink with payload redaction.
