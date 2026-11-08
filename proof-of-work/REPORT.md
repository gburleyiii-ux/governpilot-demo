# GovernPilot proof of work

This folder records what the product does after the five diligence fixes. The runner installs dependencies, repeats the conformance workflow, then tries to break the approval hash chain and the approval write path. A missing behavior is **unsupported**. A check that ran and did the wrong thing would be **fail**. This run has no failures.

The original pin was `a0e360b37bed7c86d0bc5ca384c61043939a8f93`. This run executed the fixed source on top of that history. `productTreeMatchesPin` is false because the product files now differ from that pin on purpose.

## Counts

| Group | Pass | Fail | Unsupported | Total |
| --- | ---: | ---: | ---: | ---: |
| Existing suite (install, build, and the CI checks) | 15 | 0 | 0 | 15 |
| Adversarial harness | 24 | 0 | 5 | 29 |
| **All recorded tests** | **39** | **0** | **5** | **44** |

Run window: `2026-11-08T12:09:59.141Z` to `2026-11-08T12:10:18.713Z`.

Node `v22.23.4`, npm `10.9.9`, linux x64. The GitHub workflow pins Node 20. This run used the Node on this machine. Every existing-suite step exited 0, including conformance (`L1 MUST 34/34`, self-asserted) and the TCK (20/20 black-box, 28/28 attestation items covered).

## Reproduce

From a checkout of this branch:

```bash
proof-of-work/run-all.sh
cd proof-of-work && sha256sum -c manifest.sha256
```

The runner restores only the files the suite rewrites (`data/sentinelops-state.json`, the conformance report, and similar generated artifacts). It does not revert product source. The repository ignores `*.log`. `proof-of-work/.gitignore` keeps this run's logs so a later checkout still matches the manifest.

Open `proof-of-work/demo.html`. It reads the embedded results, and uses `results.json` beside it when a local web server is available. No network assets.

## What changed

**Head and length anchor.** Each approval write now stores `approvalLedgerAnchor`: the ledger length, the newest signature, and an HMAC over those two fields. `verifyApprovalLedger(entries, anchor)` fails when the newest record is removed or the length no longer matches. The untouched chain still verifies against the same anchor. Callers that do not pass an anchor still check only the links they were given, so older in-memory tests keep working. A state file written before this field existed is checked that way until the next approval seals an anchor.

**Empty ledger.** `verifyApprovalLedger([])` returns `passed: false`. An empty list is no longer treated as a valid chain.

**Development key.** Local development still verifies chains signed with the shipped development key, so the demo runs without a secret. Production-like verification rejects any approval or anchor whose signature matches that public key, or whose `signatureMode` is `local-dev-hmac-sha256`. A chain signed with a real production secret still verifies in that posture. A production-like process with no secret, or with the development key installed as the secret, still refuses to sign.

**Stable content hashes.** `manifestSha256` and `exportSha256` are hashes of the evidence body. `generatedAt` is still returned on the object and is not part of the hashed bytes. Two builds of the same evidence now produce the same hash.

**Policy fail closes the write.** `applyGateDecision` throws `POLICY_BLOCKED` (HTTP 422 on the approval route) when the policy result is not pass. The approval is not saved and the run is not marked approved. A missing rollback playbook fails `evidence-rollback-playbook` and `pac-evid-003` and leaves the state file unchanged. The agent smoke now sends an explicit reviewer role, which the policy already required; the old script was relying on a failed check being saved anyway.

**Policy deadline.** `evaluateApprovalPolicy` runs inside `withPolicyDeadline`. The default is 5 seconds (`SENTINELOPS_POLICY_TIMEOUT_MS`). A hung check, or a non-positive deadline, throws `POLICY_TIMEOUT` and the write is not saved.

## Tamper-detection demo

The page uses the five-record chain from this run. Newest card on the left. Each card's `previousHash` is supposed to equal the signature of the card to its right.

1. **Clean chain.** All five seals and all four links verified. The same chain also verifies against its sealed head-and-length anchor.
2. **Edit.** The reviewer on `story-00002` was changed and the signature bytes were left alone. That card's HMAC no longer matches. The previous-hash pointer on the card still matches the next signature. The broken link is the seal on the card.
3. **Delete.** `story-00002` was removed. The newer card still names the deleted signature, so that link fails.
4. **Newest record removed.** The anchor still names `story-00004` and length 5. Verification fails with reason `length`. The uncut chain still passes against that anchor.
5. **Empty list.** Rejected.

On the live API, three approvals were stored and the integrity endpoint accepted the ledger. Editing one approval's reviewer on disk made the next integrity read fail.

The 10,000-record check still builds and verifies in this process, and an edit inside that chain is detected. The timing in `results.json` is local HMAC work, not 10,000 HTTP calls.

## Fail-closed behavior

| Situation | What happened | Result |
| --- | --- | --- |
| Policy result is fail (rollback evidence removed) | `POLICY_BLOCKED`. State file unchanged. Run not marked approved. | Pass |
| Policy check throws (reviewer was a number) | Exception. State file unchanged. | Pass |
| Policy file moved aside | Load threw `ENOENT`. State file unchanged. File restored by the harness. | Pass |
| Policy check exceeds its deadline | `POLICY_TIMEOUT` at 20ms against an 80ms delay. State file unchanged. | Pass |
| SSN-shaped body on `POST /api/runs` | HTTP 422. Run count unchanged. | Pass |
| Reviewer told not to allow scoped writes | The function returned `block` / `approval-required`. No executor enforces it. | Pass for the recommendation. Unsupported for enforcement. |

## Still open

These stayed unsupported. They are not claimed as fixed.

1. **Audit events are not a hash chain.** An event is `{ id, at, runId, event }`. A manifest can hash the whole list. Nothing stores that hash and checks it later.
2. **No anchored manifest re-check.** The content hash is now stable. The product still does not save a manifest hash and reject a later copy that differs.
3. **No tool executor.** `toolUseDecision` is a string on the review. Nothing performs an external write and refuses it because of that string.
4. **The local store is not append-only.** `saveState` rewrites the whole JSON file. A second save with an edited approval succeeds. The anchor and the chain detect some of those edits afterward. The store does not refuse them.
5. **Compliance papers trust the report.** A requirement marked Fail is not called fully implemented, and the POA&M keeps the external 3PAO gap. The generator does not re-run the checks. A report handed to it with every status forced to Pass is rendered as implemented.
6. **Legacy ledgers without an anchor.** Files written before `approvalLedgerAnchor` existed are still checked only for internal consistency until the next honest approval seals an anchor. Deleting the newest record in such a file, and also deleting the anchor if one was added, is still possible for someone who can rewrite the state file and who holds the signing key.

## Pass / fail table

### Existing suite

All 15 steps passed. Full stdout is under `proof-of-work/logs/`.

| Result | Step | Command |
| --- | --- | --- |
| Pass | `npm-ci` | `npm ci --no-audit --no-fund` |
| Pass | `build` | `npm run build` |
| Pass | `signing-check` | `npm run signing:check` |
| Pass | `auth-guard-check` | `npm run auth:guard-check` |
| Pass | `auth-check` | `npm run auth:check` |
| Pass | `auth-oidc-check` | `npm run auth:oidc-check` |
| Pass | `claim-audit` | `npm run claim:audit` |
| Pass | `stripe-guard-check` | `npm run stripe:guard-check` |
| Pass | `health-check` | `npm run health:check` |
| Pass | `evals-local` | `npm run evals:local` |
| Pass | `api-health` | local API on port 4175 answered `/api/health` |
| Pass | `conformance` | `npm run conformance` |
| Pass | `crosswalk-check` | `npm run crosswalk:check` |
| Pass | `compliance-check` | `npm run compliance:check` |
| Pass | `tck-check` | `npm run tck:check` |

### Adversarial harness

| Result | Test | Claim that was checked |
| --- | --- | --- |
| Pass | `clean_chain_verifies` | A freshly signed 5-record ledger verifies |
| Pass | `edited_entry_detected` | An edited field with the old HMAC is detected |
| Pass | `deleted_middle_entry_detected` | Deleting a middle approval is detected |
| Pass | `deleted_oldest_entry_detected` | Deleting the oldest approval is detected |
| Pass | `reordered_entries_detected` | Swapping two approvals is detected |
| Pass | `inserted_forged_entry_detected` | An inserted record with an invented signature is detected |
| Pass | `truncated_tail_detected` | Dropping the two oldest records is detected |
| Pass | `head_truncation_detected` | Dropping the newest approval fails the stored head and length anchor |
| Pass | `empty_ledger_detected` | An empty ledger is rejected |
| Pass | `dev_key_resigned_chain_rejected` | Production-like verification rejects a dev-key chain; local dev and a real production secret still verify |
| Pass | `production_like_without_secret_refuses_to_sign` | Production-like startup without a secret refuses to sign |
| Pass | `volume_10k_chain` | 10,000 records verify, and one edit is detected |
| Pass | `top_level_evidence_hash_is_stable` | Rebuilding the same evidence keeps the same manifest and export hash |
| Pass | `audit_event_section_hash_changes_when_edited` | The audit-event section hash changes when the text changes |
| Unsupported | `audit_events_are_hash_chained` | Each audit event is hash-chained |
| Unsupported | `anchored_manifest_verification` | A stored manifest hash is rechecked later |
| Pass | `policy_violating_write_blocked` | A failing policy check prevents the approval from being saved |
| Pass | `reviewer_refuses_scoped_write_when_evidence_missing` | The deterministic reviewer does not recommend scoped writes when evidence is missing |
| Unsupported | `tool_executor_enforces_reviewer_block` | A tool executor refuses the write the reviewer blocked |
| Pass | `policy_check_error_does_not_persist` | A throw inside policy evaluation does not save the approval |
| Pass | `missing_policy_file_does_not_persist` | A missing policy file does not save the approval |
| Pass | `policy_check_timeout_fail_closed` | A timed-out policy check is aborted and the write is refused |
| Unsupported | `storage_rejects_historical_edit` | The store rejects an edit to an approval already written |
| Pass | `non_pass_requirement_not_marked_implemented` | A Fail requirement is not marked fully implemented and is listed on the POA&M |
| Unsupported | `compliance_generator_reexecutes_checks` | The paper generator re-runs conformance before saying Implemented |
| Pass | `poam_keeps_external_authorization_gaps` | The POA&M keeps the stated external gaps, including 3PAO |
| Pass | `http_clean_chain_verifies` | The live API builds a ledger its integrity endpoint accepts |
| Pass | `http_disk_edit_detected` | The integrity endpoint fails after an on-disk edit |
| Pass | `http_sensitive_payload_blocked` | An SSN-shaped create-run body is rejected and not stored |

## What this does not claim

This is not a penetration test, a FedRAMP or CMMC authorization, or a legal opinion. Conformance here is the repository's own suite, re-run and logged. Someone who can rewrite the state file and who holds the signing key can reseal the anchor. The anchor stops the previous case, where deleting the newest record left a chain the verifier accepted with no extra secret.
