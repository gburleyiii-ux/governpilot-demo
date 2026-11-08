# GovernPilot proof of work

This folder records one run of the product checks and the adversarial harness. The counts, the 10,000-record timings, and the log extracts below are copied from `results.json`. `demo.html` reads the same `timing.buildMs` and `timing.verifyMs` fields.

The original product pin is `a0e360b37bed7c86d0bc5ca384c61043939a8f93`. `headAtRun` is `6a74711d6e601d650fd07ab9453c8f04dc338f87`. `productTreeMatchesPin` is `false`.

## Counts

| Group | Pass | Fail | Unsupported | Total |
| --- | ---: | ---: | ---: | ---: |
| Existing suite | 15 | 0 | 0 | 15 |
| Adversarial harness | 24 | 0 | 5 | 29 |
| **All recorded tests** | **39** | **0** | **5** | **44** |

The demo header uses `summary.all`, so the on-screen counts are 39 pass, 0 fail, and 5 unsupported.

Run window: `2026-11-08T13:04:07.562Z` to `2026-11-08T13:04:29.675Z`.

Node `v20.20.2`, npm `10.8.2`, linux x64. This run used v20.20.2. The GitHub workflow .github/workflows/conformance.yml pins Node 20 and does not pin a patch release. This is not a copy of the GitHub-hosted runner image.

Log extracts, copied verbatim:

- `L1 MUST: 34/34 pass — L1 CONFORMANT`
- `PASS  zero black-box MUST failures — 20/20 pass`
- `PASS  zero uncovered attestation requirements — 28/28 covered`

## Canonical 10,000-record timing

These integers are `timing.buildMs` and `timing.verifyMs`. The demo prints those same fields.

- Build: **60** ms
- Verify: **112** ms
- Entries: 10000
- Tamper at index 5000 detected: true
- Derived verify rate stored as `verifyEntriesPerSecond`: 89286
- Unrounded medians stored as `medianBuildMs` / `medianVerifyMs`: 60.394 / 112.135
- Method: `median`
- Clock: `performance.now()`
- Samples: 7 measured runs after 1 discarded warmup
- Build samples, ms: 64.695, 60.394, 60.111, 60.902, 60.33, 59.459, 62.542
- Verify samples, ms: 112.662, 111.099, 112.135, 111.965, 121.646, 110.735, 113.277
- Node: `v20.20.2`
- Machine: linux x64, kernel `6.12.113+`, 4 CPU, `Intel(R) Xeon(R) Processor`, 16780623872 bytes RAM
- Summary string shown on the demo: Median of 7 runs after 1 discarded warmup. Clock performance.now(). Node v20.20.2.

The displayed build and verify integers are `Math.round` of those medians. This is in-process HMAC work, not 10000 HTTP calls.

## Secondary timing, not canonical

Same median protocol, launched with a different Node binary. Do not quote these numbers as the proof timing.

- Node `v22.23.4`
- Reported build `48` ms (medianBuildMs `48.464`)
- Reported verify `74` ms (medianVerifyMs `73.519`)
- Median of 7 runs after 1 discarded warmup. Clock performance.now(). Node v22.23.4.

## Reproduce

From a checkout of this branch:

```bash
proof-of-work/run-all.sh
cd proof-of-work && sha256sum -c manifest.sha256
```

The committed run was produced with Node `v20.20.2` on PATH. The runner restores only generated artifacts (`data/sentinelops-state.json`, the conformance report, and the compliance drafts the suite rewrites). It does not revert product source. The repository ignores `*.log`. `proof-of-work/.gitignore` keeps this run's logs so the manifest still matches after checkout.

Open `proof-of-work/demo.html`. The page uses the embedded copy of `results.json`, and prefers a sibling `results.json` when a local web server can fetch it. No network assets.

## What the checks show

**Head and length anchor.** Each approval write stores `approvalLedgerAnchor`. The sealed anchor still names story-00004 and length 5. After that newest record was removed, verification failed (length). The untouched chain still verifies against the same anchor.

**Empty ledger.** An empty ledger was rejected.

**Development key.** The same dev-key chain still verifies in this local-dev process. Under a production-like environment with a different signing secret, every dev-key signature is rejected. A chain signed with that production secret still verifies.

**Stable content hashes.** manifestSha256 and exportSha256 were stable across two builds.

**Policy fail closes the write.** applyGateDecision threw POLICY_BLOCKED. Failing checks: evidence-rollback-playbook, pac-evid-003. The state file was not rewritten, so the run was not saved as Approved for controlled pilot.

**Policy deadline.** withPolicyDeadline aborted a hung check at 30ms. applyGateDecision given an 80ms delay and a 20ms deadline threw POLICY_TIMEOUT and left the state file unchanged. The default deadline is 5 seconds via the environment variable `SENTINELOPS_POLICY_TIMEOUT_MS`.

## Tamper-detection demo

The page uses the five-record chain from this run. Newest card on the left. Each card's `previousHash` is supposed to equal the signature of the card to its right.

1. **Clean chain.** All five seals and all four links verified.
2. **Edit.** The reviewer on `story-00002` was changed and the signature bytes were left alone. That card's HMAC no longer matches.
3. **Delete.** `story-00002` was removed. The newer card still names the deleted signature, so that link fails.
4. **Newest record removed.** The sealed anchor still names story-00004 and length 5. After that newest record was removed, verification failed (length). The untouched chain still verifies against the same anchor.
5. **Empty list.** An empty ledger was rejected.

On the live API, three approvals were stored and the integrity endpoint accepted the ledger. Editing one approval's reviewer on disk made the next integrity read fail.

The 10,000-record panel on that page prints build 60 ms and verify 112 ms, which are `timing.buildMs` and `timing.verifyMs`.

## Still open

These stayed unsupported.

1. **`audit_events_are_hash_chained`** (unsupported). Not implemented. Audit events in the evidence state are { id, at, runId, event }. They have no previousHash and no signature. verifyApprovalLedger covers approvals only. A whole-array section hash is computed when a manifest is built.
2. **`anchored_manifest_verification`** (unsupported). Not implemented. server/audit-integrity.mjs exports: buildEvidenceBundle, buildEvidenceManifest, buildFullAuditExport, sealLedgerAnchor, signApprovalPayload, verifyApprovalLedger, verifyApprovalSignature. Manifests and exports are generated with a hash. Nothing in this module stores that hash and verifies a later copy against it.
3. **`tool_executor_enforces_reviewer_block`** (unsupported). Not implemented. toolUseDecision is referenced in: agent/sentinelops-agent.mjs, evals/run-local.mjs, scripts/smoke-agent.mjs, scripts/smoke-alert-routing.mjs, scripts/smoke-audit-integrity.mjs, scripts/smoke-observability.mjs, src/lib/types.ts. Nothing under server/ executes an external tool write and blocks on that field. The deterministic reviewer only returns the string.
4. **`storage_rejects_historical_edit`** (unsupported). Not implemented. createLocalJsonStore.saveState rewrote the whole JSON document when an approval was inserted, and loadState returned it. The README calls the ledger append-only. The local adapter does not refuse historical edits. Detection, when it works, happens later in verifyApprovalLedger.
5. **`compliance_generator_reexecutes_checks`** (unsupported). Not implemented. buildControlImplementations was given a report copy with every requirement forced to Pass. All 34 mapped controls came back implemented=true. No conformance script was executed. The generator trusts the status strings it is given.

Legacy state files that have no `approvalLedgerAnchor` are still checked only for internal consistency until the next approval seals an anchor. Someone who holds the signing key and can rewrite the state file can reseal that anchor.

## Pass / fail table

### Existing suite

| Result | Test | Claim |
| --- | --- | --- |
| Pass | `npm-ci` | CI-equivalent step `npm ci --no-audit --no-fund` exits 0 |
| Pass | `build` | CI-equivalent step `npm run build` exits 0 |
| Pass | `signing-check` | CI-equivalent step `npm run signing:check` exits 0 |
| Pass | `auth-guard-check` | CI-equivalent step `npm run auth:guard-check` exits 0 |
| Pass | `auth-check` | CI-equivalent step `npm run auth:check` exits 0 |
| Pass | `auth-oidc-check` | CI-equivalent step `npm run auth:oidc-check` exits 0 |
| Pass | `claim-audit` | CI-equivalent step `npm run claim:audit` exits 0 |
| Pass | `stripe-guard-check` | CI-equivalent step `npm run stripe:guard-check` exits 0 |
| Pass | `health-check` | CI-equivalent step `npm run health:check` exits 0 |
| Pass | `evals-local` | CI-equivalent step `npm run evals:local` exits 0 |
| Pass | `api-health` | CI-equivalent step `curl -sf http://127.0.0.1:4175/api/health` exits 0 |
| Pass | `conformance` | CI-equivalent step `npm run conformance` exits 0 |
| Pass | `crosswalk-check` | CI-equivalent step `npm run crosswalk:check` exits 0 |
| Pass | `compliance-check` | CI-equivalent step `npm run compliance:check` exits 0 |
| Pass | `tck-check` | CI-equivalent step `npm run tck:check` exits 0 |

### Adversarial harness

| Result | Test | Claim |
| --- | --- | --- |
| Pass | `clean_chain_verifies` | A freshly signed 5-record approval ledger passes verifyApprovalLedger |
| Pass | `edited_entry_detected` | Changing an approval field without recomputing the HMAC is detected |
| Pass | `deleted_middle_entry_detected` | Deleting a middle approval is detected |
| Pass | `deleted_oldest_entry_detected` | Deleting the oldest approval is detected |
| Pass | `reordered_entries_detected` | Swapping two adjacent approvals is detected |
| Pass | `inserted_forged_entry_detected` | An inserted approval with an invented signature is detected |
| Pass | `truncated_tail_detected` | Dropping the two oldest approvals (truncated tail) is detected |
| Pass | `head_truncation_detected` | Dropping the newest approval is detected against the stored head and length anchor |
| Pass | `empty_ledger_detected` | Deleting every approval is detected |
| Pass | `dev_key_resigned_chain_rejected` | Production-like verification rejects a chain signed with the shipped development key |
| Pass | `production_like_without_secret_refuses_to_sign` | A production-like environment without a signing secret refuses to sign |
| Pass | `volume_10k_chain` | verifyApprovalLedger checks a 10,000-record chain, including one edited record |
| Pass | `top_level_evidence_hash_is_stable` | Rebuilding an evidence manifest or full export for the same data keeps the same top-level hash |
| Pass | `audit_event_section_hash_changes_when_edited` | The auditEvents section hash changes when an audit event string changes |
| Unsupported | `audit_events_are_hash_chained` | Individual audit events are hash-chained the way approvals are |
| Unsupported | `anchored_manifest_verification` | A stored manifest hash is rechecked later and rejects a divergent manifest |
| Pass | `policy_violating_write_blocked` | An approval that fails the policy check is not persisted as an approval |
| Pass | `reviewer_refuses_scoped_write_when_evidence_missing` | The deterministic reviewer does not recommend allow-scoped-write-tools when required evidence is missing |
| Unsupported | `tool_executor_enforces_reviewer_block` | A runtime tool executor refuses a write when the reviewer says policy-blocked or approval-required |
| Pass | `policy_check_error_does_not_persist` | If policy evaluation throws, the approval is not persisted |
| Pass | `missing_policy_file_does_not_persist` | If the approval policy file is missing, the approval is not persisted |
| Pass | `policy_check_timeout_fail_closed` | A policy check that exceeds a deadline is aborted and the write is refused |
| Unsupported | `storage_rejects_historical_edit` | The local state store rejects an in-place edit of an approval (append-only enforcement) |
| Pass | `non_pass_requirement_not_marked_implemented` | A requirement marked Fail is not rendered as a fully implemented NIST control, and it appears on the POA&M |
| Unsupported | `compliance_generator_reexecutes_checks` | Compliance evidence re-runs the conformance checks before marking a control Implemented |
| Pass | `poam_keeps_external_authorization_gaps` | The POA&M keeps the stated external authorization gaps, including independent assessment |
| Pass | `http_clean_chain_verifies` | POST /api/runs and POST /api/runs/:id/approval produce a ledger GET /api/audit/integrity accepts |
| Pass | `http_disk_edit_detected` | GET /api/audit/integrity reports failure after an approval field is edited on disk |
| Pass | `http_sensitive_payload_blocked` | A mutating request containing an SSN-shaped string is rejected before it is stored |

## Names a reviewer will see

The buyer-facing name in this report and on `demo.html` is GovernPilot. The package name is still `sentinelops-ai`. These identifiers are left as they appear in code, environment variables, and file paths:

- Package and service ids: `sentinelops-ai`, `sentinelops-api`
- Environment variables prefixed `SENTINELOPS_`, including `SENTINELOPS_POLICY_TIMEOUT_MS`, `SENTINELOPS_SIGNING_SECRET`, `SENTINELOPS_LOCAL_STATE_PATH`
- State file `data/sentinelops-state.json`
- Module path `agent/sentinelops-agent.mjs`
- Signature mode string `local-dev-hmac-sha256`, which the demo prints on the clean-chain panel

## What this does not claim

This is not a penetration test, a FedRAMP or CMMC authorization, or a legal opinion. Conformance here is the repository's own suite, re-run and logged.
