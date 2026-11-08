# GovernPilot proof of work

This folder records what the product at commit `a0e360b37bed7c86d0bc5ca384c61043939a8f93` actually did when its own checks were run, and when a separate harness tried to break the audit chain and the approval write path. The harness did not change product source. Where a behavior is missing, the result is **unsupported**. Where a check ran and the product did the wrong thing for that claim, the result is **fail**.

## Counts

| Group | Pass | Fail | Unsupported | Total |
| --- | ---: | ---: | ---: | ---: |
| Existing suite (install, build, and the CI checks) | 15 | 0 | 0 | 15 |
| Adversarial harness | 18 | 5 | 6 | 29 |
| **All recorded tests** | **33** | **5** | **6** | **44** |

Run window: `2026-11-08T11:15:11.440Z` to `2026-11-08T11:15:31.632Z`.

Node `v22.23.4`, npm `10.9.9`, linux x64. The GitHub workflow pins Node 20. This run used the Node on this machine. It is not a copy of the GitHub runner image. Every existing-suite step still exited 0 here.

The conformance log says `L1 MUST: 34/34 pass — L1 CONFORMANT`. The TCK log says 20/20 black-box checks passed and 28/28 attestation items were covered. Those are the product's own self-asserted checks. They are not an independent authorization.

## Reproduce

From a clean checkout of this branch:

```bash
proof-of-work/run-all.sh
```

That installs dependencies, runs the same checks the conformance workflow runs, restores any product files those checks rewrite, runs the adversarial harness, and rewrites:

- `proof-of-work/results.json`
- `proof-of-work/logs/`
- `proof-of-work/manifest.sha256`
- the embedded copy of the results inside `proof-of-work/demo.html`

Check the manifest with:

```bash
cd proof-of-work && sha256sum -c manifest.sha256
```

Open `proof-of-work/demo.html` in a browser. It reads the embedded results, and uses `results.json` beside it when a local web server is available. No network assets.

## What the code actually does

**Approval ledger.** Each approval is signed with HMAC-SHA256 over the record plus the previous signature. Records are stored newest first. `verifyApprovalLedger` in `server/audit-integrity.mjs` recomputes each HMAC and checks that each record's `previousHash` equals the next record's signature. The oldest record must point at null. `GET /api/audit/integrity` calls that function on whatever is in the state file.

**Audit events.** Lines in the audit-event list are plain objects (`id`, `at`, `runId`, `event`). They are not individually signed or chained. A manifest can hash the whole list. Nothing stores that hash and checks it later.

**Evidence hashes.** Building a manifest or a full export stamps `generatedAt` inside the bytes that become `manifestSha256` and `exportSha256`. Two builds of the same evidence a few milliseconds apart produced two different top-level hashes. The per-section hashes, which do not include the clock, stayed put until an audit line was edited, and then the `auditEvents` section hash changed.

**Policy and writes.** Deciding an approval always runs the policy checks. If the check throws (a non-string reviewer, or the policy file missing), the state file is not saved. If the check returns **fail**, the approval is still saved and the run is marked **Approved for controlled pilot**. On a run missing the rollback playbook, the failing checks were `evidence-rollback-playbook` and `pac-evid-003`. The deterministic reviewer then returns `recommendation: block` and `toolUseDecision: approval-required`. Nothing in the server executes an external tool and refuses it because of that string.

**Data boundary.** A create-run request whose JSON contained an SSN-shaped string was rejected with HTTP 422. The run was not stored. That scanner is separate from the approval policy.

**Compliance papers.** The generator turns the conformance report into SSP-style statements, a POA&M, and a monitoring plan. A requirement marked Fail is not called fully implemented, and it shows up on the POA&M. The POA&M also keeps the external gaps the product already states, including an independent 3PAO assessment. The generator does not re-run the checks. A report handed to it with every status forced to Pass was rendered as fully implemented.

**Signing key.** The default demo key is in source. With that key, a brand-new chain verifies. Setting a production-like environment with no private secret makes `resolveSigningSecret` throw, so the process will not sign. That refusal passed.

**Storage.** The local store rewrites the whole JSON file. It does not reject an edit to an older approval. "Append-only" is not enforced by the adapter. Detection, when it works, happens later, in the verifier.

## Tamper-detection demo

The animated page uses the five-record chain from this run. Newest card on the left. Each card's `previousHash` is supposed to equal the signature of the card to its right.

1. **Clean chain.** All five seals and all four links verified.
2. **Edit.** The reviewer on `story-00002` was changed and the signature bytes were left alone. That card's HMAC no longer matches. The previous-hash pointer on the card still matches the next signature. The broken link is the seal on the card, not the arrow to the older card.
3. **Delete.** `story-00002` was removed from the array. The newer card, `story-00003`, still names the deleted signature, so the arrow from that card fails.
4. **Also tried, and not caught.** Deleting the newest card left a chain the verifier still accepts. There is no stored head, length, or outside anchor. Deleting every approval also passes, because an empty list has no failing check.

On the real HTTP API, three approvals were created and the integrity endpoint said the ledger passed. Editing one approval's reviewer on disk made the next integrity read fail.

The 10,000-record check built the chain in 65 ms and verified it in 47 ms in this process. Editing record 5000 was detected. That timing is local HMAC work, not 10,000 HTTP requests.

## Fail-closed behavior

| Situation | What happened | Result |
| --- | --- | --- |
| Policy check throws (`reviewer` was a number, so `.trim()` threw) | State file hash unchanged. No approval saved. | Pass |
| Policy file moved aside | Load threw `ENOENT`. State file not rewritten. File restored by the harness. | Pass |
| Policy returns fail (rollback evidence removed) | Approval saved. Run set to "Approved for controlled pilot". | **Fail** |
| Policy check times out | No timeout, abort signal, or deadline exists on the policy functions. Nothing was simulated. | Unsupported |
| SSN-shaped body on `POST /api/runs` | HTTP 422. Run count unchanged. | Pass |
| Reviewer told not to allow scoped writes | The function returned `block` / `approval-required`. No executor enforces it. | Pass for the recommendation. Unsupported for enforcement. |

## Diligence risks

These are the failures and gaps. They are the items a buyer should not treat as solved.

1. **Newest-record deletion is invisible.** `head_truncation_detected` failed. The verifier only checks internal consistency of the array it is given.
2. **Wiping the ledger looks valid.** `empty_ledger_detected` failed. `verifyApprovalLedger([])` returns `passed: true`.
3. **The demo signing key can mint a valid chain.** `dev_key_resigned_chain_rejected` failed in the default local-dev posture. A production-like process without a real secret refuses to sign; that separate check passed. Anyone with this repository can still build a ledger the default verifier accepts.
4. **The handoff hash is not a content address.** `top_level_evidence_hash_is_stable` failed. `manifestSha256` and `exportSha256` move whenever `generatedAt` moves, even if the evidence did not.
5. **A failed policy does not block the approval write.** `policy_violating_write_blocked` failed. The UI copy and the reviewer's recommendation say the action stays blocked. The persisted gate says approved.
6. **Audit events are not a hash chain.** Unsupported. Tampering with one is visible only if you still have an older section hash to compare. The product does not store and recheck that anchor.
7. **The local store is not append-only.** Unsupported. A second save with an edited approval succeeded.
8. **There is no tool-execution interlock.** Unsupported. `toolUseDecision` is a string on the review object.
9. **There is no policy timeout.** Unsupported. A stuck check is not cut off by this code.
10. **Compliance statements trust the report.** Unsupported as a re-check. They will describe a forged all-pass report as implemented. They do surface real Fail rows and the external 3PAO / sponsor gaps when those are in the inputs. The product's own documents already say this output is a draft, not an authorization.

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
| **Fail** | `head_truncation_detected` | Dropping the newest approval is detected |
| **Fail** | `empty_ledger_detected` | Deleting every approval is detected |
| **Fail** | `dev_key_resigned_chain_rejected` | A chain signed with the key this process trusts is rejected |
| Pass | `production_like_without_secret_refuses_to_sign` | Production-like startup without a secret refuses to sign |
| Pass | `volume_10k_chain` | 10,000 records verify, and one edit is detected |
| **Fail** | `top_level_evidence_hash_is_stable` | Rebuilding the same evidence keeps the same manifest and export hash |
| Pass | `audit_event_section_hash_changes_when_edited` | The audit-event section hash changes when the text changes |
| Unsupported | `audit_events_are_hash_chained` | Each audit event is hash-chained |
| Unsupported | `anchored_manifest_verification` | A stored manifest hash is rechecked later |
| **Fail** | `policy_violating_write_blocked` | A failing policy check prevents the approval from being saved |
| Pass | `reviewer_refuses_scoped_write_when_evidence_missing` | The deterministic reviewer does not recommend scoped writes when evidence is missing |
| Unsupported | `tool_executor_enforces_reviewer_block` | A tool executor refuses the write the reviewer blocked |
| Pass | `policy_check_error_does_not_persist` | A throw inside policy evaluation does not save the approval |
| Pass | `missing_policy_file_does_not_persist` | A missing policy file does not save the approval |
| Unsupported | `policy_check_timeout_fail_closed` | A timed-out policy check is aborted and the write is refused |
| Unsupported | `storage_rejects_historical_edit` | The store rejects an edit to an approval already written |
| Pass | `non_pass_requirement_not_marked_implemented` | A Fail requirement is not marked fully implemented and is listed on the POA&M |
| Unsupported | `compliance_generator_reexecutes_checks` | The paper generator re-runs conformance before saying Implemented |
| Pass | `poam_keeps_external_authorization_gaps` | The POA&M keeps the stated external gaps, including 3PAO |
| Pass | `http_clean_chain_verifies` | The live API builds a ledger its integrity endpoint accepts |
| Pass | `http_disk_edit_detected` | The integrity endpoint fails after an on-disk edit |
| Pass | `http_sensitive_payload_blocked` | An SSN-shaped create-run body is rejected and not stored |

## What this does not claim

This is not a penetration test, a FedRAMP or CMMC authorization, or a legal opinion. Conformance here is the repository's own suite, re-run and logged. The health, alert, and dispatch ledgers use the same newest-first HMAC idea; this harness measured the approval ledger in `server/audit-integrity.mjs` and the approval route that calls it, not every ledger in the repo.
