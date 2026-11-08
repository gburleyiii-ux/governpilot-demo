// Adversarial checks against the product at this checkout.
// Imports product modules. Does not modify product source.
// A failing property is recorded as "fail". A missing capability is "unsupported".
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, statSync } from "node:fs";
import { mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const policyFile = fileURLToPath(new URL("../../server/policies/agent-action-policy.json", import.meta.url));
const hiddenPolicy = `${policyFile}.pow-hidden`;
const work = mkdtempSync(join(tmpdir(), "gp-pow-"));
const directStatePath = join(work, "direct-state.json");
const httpStatePath = join(work, "http-state.json");
process.env.SENTINELOPS_LOCAL_STATE_PATH = directStatePath;
process.env.SENTINELOPS_LOCAL_EVIDENCE_PATH = join(work, "evidence", "/");
process.env.NODE_ENV = process.env.NODE_ENV === "production" ? "test" : process.env.NODE_ENV || "test";

function restorePolicySync() {
  if (existsSync(hiddenPolicy) && !existsSync(policyFile)) {
    renameSync(hiddenPolicy, policyFile);
  }
}
process.on("exit", restorePolicySync);

const outPath = process.argv[2] || fileURLToPath(new URL("../logs/adversarial.json", import.meta.url));
const tests = [];

function clip(value, max = 500) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function record(entry) {
  tests.push({
    group: "adversarial",
    durationMs: Math.round(entry.durationMs || 0),
    ...entry,
    detail: clip(entry.detail, 1200),
  });
}

async function timed(fn) {
  const start = performance.now();
  try {
    const value = await fn();
    return { ok: true, value, durationMs: performance.now() - start };
  } catch (error) {
    return { ok: false, error, durationMs: performance.now() - start };
  }
}

function short(hash) {
  if (!hash) return null;
  return `${hash.slice(0, 12)}…${hash.slice(-6)}`;
}

function slimCheck(check, index) {
  const signatureValid = Boolean(check.signatureValid);
  const chainLinkValid = Boolean(check.chainLinkValid);
  let reason = "intact";
  if (!signatureValid && !chainLinkValid) {
    reason = "HMAC does not match this record, and previousHash does not match the next signature";
  } else if (!signatureValid) {
    reason = "HMAC does not match the record payload and previousHash";
  } else if (!chainLinkValid) {
    reason = "previousHash does not match the next record's signature";
  }
  return {
    index,
    id: check.id,
    signatureValid,
    chainLinkValid,
    reason,
  };
}

function viewRecord(recordItem, index, total) {
  return {
    index,
    id: recordItem.id,
    position: index === 0 ? "newest" : index === total - 1 ? "oldest" : "middle",
    state: recordItem.state,
    reviewer: recordItem.reviewer,
    reviewerRole: recordItem.reviewerRole,
    signature: recordItem.signature,
    signatureShort: short(recordItem.signature),
    previousHash: recordItem.previousHash,
    previousHashShort: short(recordItem.previousHash),
  };
}

const {
  buildEvidenceManifest,
  buildFullAuditExport,
  signApprovalPayload,
  verifyApprovalLedger,
} = await import("../../server/audit-integrity.mjs");
const { applyGateDecision, createAssessmentRun, rerunEvalPack } = await import("../../server/assessment-engine.mjs");
const { runDeploymentReview } = await import("../../agent/sentinelops-agent.mjs");
const { assertPilotDataBoundary } = await import("../../server/data-protection.mjs");
const {
  buildContinuousMonitoringPlan,
  buildControlImplementations,
  buildPoam,
  DEFAULT_AUTHORIZATION_GAPS,
} = await import("../../server/compliance-evidence.mjs");
const { evaluateSigningPosture, resolveSigningSecret, signatureModeFor } = await import("../../server/signing-guard.mjs");
const { loadState, updateState } = await import("../../server/store.mjs");

function buildChain(count, label = "chain") {
  const oldestFirst = [];
  let previous = null;
  for (let i = 0; i < count; i += 1) {
    const entry = {
      id: `${label}-${String(i).padStart(5, "0")}`,
      runId: `run-${label}-${i}`,
      gateId: "gate-api-action-group",
      traceId: `trace-${label}-${i}`,
      state: i % 5 === 4 ? "denied" : "approved",
      reviewer: "Security Reviewer",
      reviewerRole: i % 2 === 0 ? "security-reviewer" : "compliance-analyst",
      note: `${label} entry ${i}`,
      decidedAt: "2026-11-08T15:00:00.000Z",
      policyStatus: "pass",
      previousHash: previous,
      signatureMode: signatureModeFor(),
    };
    entry.signature = signApprovalPayload(entry, previous);
    oldestFirst.push(entry);
    previous = entry.signature;
  }
  return oldestFirst.reverse();
}

function detected(ledger) {
  return ledger.passed === false;
}

const story = buildChain(5, "story");
const cleanLedger = verifyApprovalLedger(story);
const cleanPass =
  cleanLedger.passed === true && cleanLedger.validSignatures === 5 && cleanLedger.validChainLinks === 5;

record({
  id: "clean_chain_verifies",
  claim: "A freshly signed 5-record approval ledger passes verifyApprovalLedger",
  status: cleanPass ? "pass" : "fail",
  detail: cleanPass
    ? "All 5 HMAC signatures and newest-to-oldest previousHash links verified."
    : `Verifier returned passed=${cleanLedger.passed}, validSignatures=${cleanLedger.validSignatures}, validChainLinks=${cleanLedger.validChainLinks}.`,
  evidence: {
    total: cleanLedger.total,
    passed: cleanLedger.passed,
    checks: cleanLedger.checks.map(slimCheck),
  },
});

const edited = structuredClone(story);
const editedFrom = edited[2].reviewer;
edited[2].reviewer = "Edited Reviewer";
const editedLedger = verifyApprovalLedger(edited);
record({
  id: "edited_entry_detected",
  claim: "Changing an approval field without recomputing the HMAC is detected",
  status: detected(editedLedger) ? "pass" : "fail",
  detail: detected(editedLedger)
    ? `Record ${edited[2].id} (index 2) fails signature verification. The previousHash pointer on that record still matches the next signature; the broken link is the HMAC seal, not the chain pointer.`
    : "verifyApprovalLedger returned passed=true after the reviewer field was changed.",
  evidence: {
    index: 2,
    id: edited[2].id,
    field: "reviewer",
    from: editedFrom,
    to: edited[2].reviewer,
    passed: editedLedger.passed,
    checks: editedLedger.checks.map(slimCheck),
  },
});

const deletedMiddle = story.filter((_, index) => index !== 2);
const deletedMiddleLedger = verifyApprovalLedger(deletedMiddle);
record({
  id: "deleted_middle_entry_detected",
  claim: "Deleting a middle approval is detected",
  status: detected(deletedMiddleLedger) ? "pass" : "fail",
  detail: detected(deletedMiddleLedger)
    ? `Removed ${story[2].id}. The newer neighbor's previousHash still names the deleted signature, so that chain link fails.`
    : "verifyApprovalLedger returned passed=true after a middle record was removed.",
  evidence: {
    removedIndex: 2,
    removedId: story[2].id,
    passed: deletedMiddleLedger.passed,
    checks: deletedMiddleLedger.checks.map(slimCheck),
  },
});

const deletedOldest = story.slice(0, -1);
const deletedOldestLedger = verifyApprovalLedger(deletedOldest);
record({
  id: "deleted_oldest_entry_detected",
  claim: "Deleting the oldest approval is detected",
  status: detected(deletedOldestLedger) ? "pass" : "fail",
  detail: detected(deletedOldestLedger)
    ? "The new tail record's previousHash is the deleted signature, not null, so the tail link fails."
    : "verifyApprovalLedger returned passed=true after the oldest record was removed.",
  evidence: {
    removedId: story[story.length - 1].id,
    passed: deletedOldestLedger.passed,
    checks: deletedOldestLedger.checks.map(slimCheck),
  },
});

const reordered = structuredClone(story);
[reordered[1], reordered[2]] = [reordered[2], reordered[1]];
const reorderedLedger = verifyApprovalLedger(reordered);
record({
  id: "reordered_entries_detected",
  claim: "Swapping two adjacent approvals is detected",
  status: detected(reorderedLedger) ? "pass" : "fail",
  detail: detected(reorderedLedger)
    ? "Adjacent swap breaks previousHash links around the swapped pair."
    : "verifyApprovalLedger returned passed=true after two records were swapped.",
  evidence: {
    swapped: [story[1].id, story[2].id],
    passed: reorderedLedger.passed,
    checks: reorderedLedger.checks.map(slimCheck),
  },
});

const inserted = structuredClone(story);
inserted.splice(2, 0, {
  id: "story-forged",
  runId: "run-forged",
  gateId: "gate-api-action-group",
  traceId: "trace-forged",
  state: "approved",
  reviewer: "Security Reviewer",
  reviewerRole: "security-reviewer",
  note: "inserted without the signing key",
  decidedAt: "2026-11-08T15:00:00.000Z",
  policyStatus: "pass",
  previousHash: "ab".repeat(32),
  signatureMode: signatureModeFor(),
  signature: "cd".repeat(32),
});
const insertedLedger = verifyApprovalLedger(inserted);
record({
  id: "inserted_forged_entry_detected",
  claim: "An inserted approval with an invented signature is detected",
  status: detected(insertedLedger) ? "pass" : "fail",
  detail: detected(insertedLedger)
    ? "The inserted record's HMAC does not verify, and neighboring previousHash links no longer match."
    : "verifyApprovalLedger returned passed=true after a forged record was inserted.",
  evidence: {
    insertedId: "story-forged",
    insertedAt: 2,
    passed: insertedLedger.passed,
    checks: insertedLedger.checks.map(slimCheck),
  },
});

const truncatedTail = story.slice(0, -2);
const truncatedLedger = verifyApprovalLedger(truncatedTail);
record({
  id: "truncated_tail_detected",
  claim: "Dropping the two oldest approvals (truncated tail) is detected",
  status: detected(truncatedLedger) ? "pass" : "fail",
  detail: detected(truncatedLedger)
    ? "The surviving tail still points at a removed signature instead of null."
    : "verifyApprovalLedger returned passed=true after the two oldest records were dropped.",
  evidence: {
    droppedIds: [story[3].id, story[4].id],
    passed: truncatedLedger.passed,
    checks: truncatedLedger.checks.map(slimCheck),
  },
});

const headTruncated = story.slice(1);
const headLedger = verifyApprovalLedger(headTruncated);
record({
  id: "head_truncation_detected",
  claim: "Dropping the newest approval is detected",
  status: detected(headLedger) ? "pass" : "fail",
  detail: detected(headLedger)
    ? "Head truncation was detected."
    : "Not detected. verifyApprovalLedger returned passed=true. The remaining records are still a consistent newest-to-oldest chain. Nothing stores the chain head, the length, or an external anchor, so deleting the newest record is invisible to this verifier.",
  evidence: {
    droppedId: story[0].id,
    passed: headLedger.passed,
    total: headLedger.total,
    validSignatures: headLedger.validSignatures,
    validChainLinks: headLedger.validChainLinks,
  },
});

const emptyLedger = verifyApprovalLedger([]);
record({
  id: "empty_ledger_detected",
  claim: "Deleting every approval is detected",
  status: emptyLedger.passed === false ? "pass" : "fail",
  detail:
    emptyLedger.passed === false
      ? "An empty ledger was rejected."
      : "Not detected. verifyApprovalLedger([]) returns passed=true because every check on an empty list is vacuously true. Wiping the approval array looks valid.",
  evidence: {
    passed: emptyLedger.passed,
    total: emptyLedger.total,
    validSignatures: emptyLedger.validSignatures,
    validChainLinks: emptyLedger.validChainLinks,
  },
});

const resigned = buildChain(4, "resigned");
const resignedLedger = verifyApprovalLedger(resigned);
record({
  id: "dev_key_resigned_chain_rejected",
  claim: "A brand-new chain signed with the key this process already trusts is rejected",
  status: resignedLedger.passed === false ? "pass" : "fail",
  detail:
    resignedLedger.passed === false
      ? "The rebuilt chain was rejected."
      : `Not rejected. verifyApprovalLedger returned passed=true for a chain this harness built with signApprovalPayload. In this environment signatureMode is ${signatureModeFor()}. The development key ships in source and is the default signer, so anyone with the repo can produce a ledger this verifier accepts. This is a property of the default demo key, not a bypass of a private production secret.`,
  evidence: {
    passed: resignedLedger.passed,
    total: resignedLedger.total,
    signatureMode: signatureModeFor(),
  },
});

const prodEnv = {
  NODE_ENV: "production",
  SENTINELOPS_MODE: "local",
  SENTINELOPS_AUTH_MODE: "local-dev",
  SENTINELOPS_API_HOST: "127.0.0.1",
};
let prodThrew = false;
let prodReason = "";
try {
  resolveSigningSecret(prodEnv);
} catch (error) {
  prodThrew = true;
  prodReason = error.message;
}
const prodPosture = evaluateSigningPosture(prodEnv);
record({
  id: "production_like_without_secret_refuses_to_sign",
  claim: "A production-like environment without a signing secret refuses to sign",
  status: prodPosture.ok === false && prodThrew ? "pass" : "fail",
  detail: prodThrew
    ? "evaluateSigningPosture reports ok=false and resolveSigningSecret throws. The shipped development key is not used to sign in that posture."
    : "The production-like posture did not refuse.",
  evidence: {
    ok: prodPosture.ok,
    signatureMode: prodPosture.signatureMode,
    threw: prodThrew,
    reason: clip(prodReason, 300),
  },
});

const volumeStarted = performance.now();
const volumeChain = buildChain(10000, "volume");
const volumeBuildMs = performance.now() - volumeStarted;
const volumeVerifyStarted = performance.now();
const volumeLedger = verifyApprovalLedger(volumeChain);
const volumeVerifyMs = performance.now() - volumeVerifyStarted;
const volumeTampered = structuredClone(volumeChain);
volumeTampered[5000].note = "tampered during volume check";
const volumeTamperedLedger = verifyApprovalLedger(volumeTampered);
const volumeOk = volumeLedger.passed === true && volumeLedger.total === 10000 && detected(volumeTamperedLedger);
record({
  id: "volume_10k_chain",
  claim: "verifyApprovalLedger checks a 10,000-record chain, including one edited record",
  status: volumeOk ? "pass" : "fail",
  durationMs: volumeBuildMs + volumeVerifyMs,
  detail: volumeOk
    ? `Built 10,000 HMAC-signed approvals in ${volumeBuildMs.toFixed(1)} ms and verified them in ${volumeVerifyMs.toFixed(1)} ms. Editing record index 5000 was detected.`
    : `Clean passed=${volumeLedger.passed} total=${volumeLedger.total}; tampered passed=${volumeTamperedLedger.passed}.`,
  evidence: {
    entries: 10000,
    buildMs: Math.round(volumeBuildMs),
    verifyMs: Math.round(volumeVerifyMs),
    verifyEntriesPerSecond: Math.round(10000 / (volumeVerifyMs / 1000)),
    cleanPassed: volumeLedger.passed,
    tamperedIndex: 5000,
    tamperDetected: detected(volumeTamperedLedger),
    signatureMode: signatureModeFor(),
  },
});

const manifestRun = createAssessmentRun(3);
const manifestDecision = await applyGateDecision(manifestRun, {
  state: "approved",
  reviewer: "Security Reviewer",
  reviewerRole: "security-reviewer",
  note: "manifest stability",
}, null);
const manifestState = {
  sequence: 3,
  runs: [manifestDecision.run],
  approvals: [manifestDecision.approvalRecord],
  policyChecks: [{ ...manifestDecision.policyResult, runId: manifestDecision.run.id, traceId: manifestDecision.run.traceId }],
  agentReviews: [],
  auditEvents: [
    {
      id: "audit-manifest-1",
      at: "2026-11-08T15:00:00.000Z",
      runId: manifestDecision.run.id,
      event: "original audit line",
    },
  ],
  alertDispatches: [],
};
const manifestFirst = buildEvidenceManifest(manifestState, manifestDecision.run.id);
await new Promise((resolve) => setTimeout(resolve, 5));
const manifestSecond = buildEvidenceManifest(manifestState, manifestDecision.run.id);
const exportFirst = buildFullAuditExport(manifestState, { service: "sentinelops-api", version: "0.22.0" });
await new Promise((resolve) => setTimeout(resolve, 5));
const exportSecond = buildFullAuditExport(manifestState, { service: "sentinelops-api", version: "0.22.0" });
const section = (manifest, label) => manifest.sections.find((item) => item.label === label)?.sha256;
const sectionStable = section(manifestFirst, "auditEvents") === section(manifestSecond, "auditEvents");
const topStable = manifestFirst.manifestSha256 === manifestSecond.manifestSha256;
const exportStable = exportFirst.exportSha256 === exportSecond.exportSha256;
record({
  id: "top_level_evidence_hash_is_stable",
  claim: "Rebuilding an evidence manifest or full export for the same data keeps the same top-level hash",
  status: topStable && exportStable ? "pass" : "fail",
  detail:
    topStable && exportStable
      ? "manifestSha256 and exportSha256 were stable across two builds."
      : `Not stable. manifestSha256 changed=${!topStable} (generatedAt ${manifestFirst.generatedAt} vs ${manifestSecond.generatedAt}). exportSha256 changed=${!exportStable}. The timestamp is inside the hashed body, so the handoff hash is not a content address of the evidence. Section hashes are a separate check.`,
  evidence: {
    manifestStable: topStable,
    exportStable,
    firstGeneratedAt: manifestFirst.generatedAt,
    secondGeneratedAt: manifestSecond.generatedAt,
    auditEventsSectionStable: sectionStable,
  },
});

const editedEvents = structuredClone(manifestState);
editedEvents.auditEvents[0].event = "edited audit line";
const manifestEdited = buildEvidenceManifest(editedEvents, manifestDecision.run.id);
const sectionChanged = section(manifestFirst, "auditEvents") !== section(manifestEdited, "auditEvents");
record({
  id: "audit_event_section_hash_changes_when_edited",
  claim: "The auditEvents section hash changes when an audit event string changes",
  status: sectionChanged && sectionStable ? "pass" : "fail",
  detail: sectionChanged
    ? "The auditEvents section hash is stable across identical rebuilds and changes when the event text changes. This is a content hash of the array, not a stored anchor and not a per-event chain."
    : "The auditEvents section hash did not behave as a content hash.",
  evidence: {
    identicalRebuildsMatch: sectionStable,
    editChangesHash: sectionChanged,
    before: short(section(manifestFirst, "auditEvents")),
    after: short(section(manifestEdited, "auditEvents")),
  },
});

const auditKeys = Object.keys(manifestState.auditEvents[0]);
const auditChained = auditKeys.includes("previousHash") && auditKeys.includes("signature");
record({
  id: "audit_events_are_hash_chained",
  claim: "Individual audit events are hash-chained the way approvals are",
  status: "unsupported",
  detail: auditChained
    ? "Unexpected: sample audit events already carry previousHash and signature. Marked unsupported only if that chain has no verifier; see evidence."
    : `Not implemented. Audit events in the evidence state are { ${auditKeys.join(", ")} }. They have no previousHash and no signature. verifyApprovalLedger covers approvals only. A whole-array section hash is computed when a manifest is built.`,
  evidence: { keys: auditKeys, verifierExportsChecked: "verifyApprovalLedger" },
});

const auditExports = Object.keys(await import("../../server/audit-integrity.mjs")).sort();
const hasManifestVerifier = auditExports.some((name) => /verify/i.test(name) && /manifest|export|evidence/i.test(name));
record({
  id: "anchored_manifest_verification",
  claim: "A stored manifest hash is rechecked later and rejects a divergent manifest",
  status: hasManifestVerifier ? "fail" : "unsupported",
  detail: hasManifestVerifier
    ? `A verifier export exists (${auditExports.filter((name) => /verify/i.test(name)).join(", ")}), but this harness did not find a stored-anchor comparison to exercise. Left as a gap rather than a simulated pass.`
    : `Not implemented. server/audit-integrity.mjs exports: ${auditExports.join(", ")}. Manifests and exports are generated with a hash. Nothing in this module stores that hash and verifies a later copy against it.`,
  evidence: { exports: auditExports },
});

const emptyState = {
  sequence: 0,
  runs: [],
  approvals: [],
  policyChecks: [],
  agentReviews: [],
  alertDispatches: [],
  liveDeliveryExecutions: [],
  auditEvents: [],
  healthRuns: [],
  healthApprovals: [],
  healthSequence: 0,
};

async function resetDirectState() {
  await writeFile(directStatePath, `${JSON.stringify(emptyState, null, 2)}\n`);
}

async function stateHash() {
  const bytes = await readFile(directStatePath);
  return createHash("sha256").update(bytes).digest("hex");
}

const goodDecision = {
  state: "approved",
  reviewer: "Security Reviewer",
  reviewerRole: "security-reviewer",
  note: "diligence harness",
};

await resetDirectState();
const violationRun = createAssessmentRun(21);
violationRun.approvalGate.requiredEvidence = violationRun.approvalGate.requiredEvidence.filter(
  (label) => label !== "Rollback playbook",
);
const violationAttempt = await timed(() =>
  updateState(async (state) => {
    state.runs.unshift(violationRun);
    const result = await applyGateDecision(state.runs[0], goodDecision, state.approvals[0]?.signature || null);
    state.runs[0] = result.run;
    state.approvals.unshift(result.approvalRecord);
    state.policyChecks.unshift({ ...result.policyResult, runId: result.run.id, traceId: result.run.traceId });
    return result;
  }),
);
const violationLoaded = await loadState();
const violationResult = violationAttempt.ok ? violationAttempt.value : null;
const violationPersisted =
  violationLoaded.approvals.length > 0 &&
  violationLoaded.runs[0]?.approvalState === "Approved for controlled pilot" &&
  violationLoaded.policyChecks[0]?.status === "fail";
const blockedDespiteViolation = !violationPersisted;
const failingChecks = (violationResult?.policyResult?.checks || [])
  .filter((check) => !check.passed)
  .map((check) => check.id);
let review = null;
if (violationResult?.run) {
  const reviewed = await timed(() => runDeploymentReview(violationResult.run));
  review = reviewed.ok ? reviewed.value : { error: clip(reviewed.error?.message) };
}
const reviewerBlocks =
  review &&
  review.recommendation === "block" &&
  review.toolUseDecision !== "allow-scoped-write-tools";
record({
  id: "policy_violating_write_blocked",
  claim: "An approval that fails the policy check is not persisted as an approval",
  status: blockedDespiteViolation ? "pass" : "fail",
  durationMs: violationAttempt.durationMs,
  detail: blockedDespiteViolation
    ? "The failing policy check prevented the approval from being saved."
    : `Not blocked. Missing "Rollback playbook" makes policy status "${violationLoaded.policyChecks[0]?.status}". updateState still saved the approval, and the run's approvalState is "${violationLoaded.runs[0]?.approvalState}". Failing checks: ${failingChecks.join(", ") || "none"}. The same function the POST /api/runs/:id/approval handler calls (applyGateDecision) returns the signed approval anyway.`,
  evidence: {
    persisted: violationPersisted,
    policyStatus: violationLoaded.policyChecks[0]?.status || null,
    approvalState: violationLoaded.runs[0]?.approvalState || null,
    approvalId: violationLoaded.approvals[0]?.id || null,
    signaturePresent: Boolean(violationLoaded.approvals[0]?.signature),
    failingChecks,
  },
});
record({
  id: "reviewer_refuses_scoped_write_when_evidence_missing",
  claim: "The deterministic reviewer does not recommend allow-scoped-write-tools when required evidence is missing",
  status: reviewerBlocks ? "pass" : "fail",
  detail: reviewerBlocks
    ? `runDeploymentReview returned recommendation "${review.recommendation}" and toolUseDecision "${review.toolUseDecision}". This is a recommendation string. No tool executor consults it before performing a write.`
    : `Reviewer result did not block scoped writes: ${JSON.stringify(review && { recommendation: review.recommendation, toolUseDecision: review.toolUseDecision, error: review.error })}`,
  evidence: review
    ? { recommendation: review.recommendation, toolUseDecision: review.toolUseDecision, mode: review.mode }
    : null,
});

const toolHits = [];
for (const file of walkSource(root)) {
  const text = readFileSync(file, "utf8");
  if (text.includes("toolUseDecision")) toolHits.push(relative(root, file));
}
function walkSource(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "proof-of-work" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkSource(full, acc);
    else if (/\.(mjs|js|ts|tsx)$/.test(name)) acc.push(full);
  }
  return acc;
}
const executorHit = toolHits.some((file) => file.startsWith("server/") && !file.endsWith("seed.mjs"));
record({
  id: "tool_executor_enforces_reviewer_block",
  claim: "A runtime tool executor refuses a write when the reviewer says policy-blocked or approval-required",
  status: "unsupported",
  detail: executorHit
    ? `toolUseDecision appears under server/ (${toolHits.filter((file) => file.startsWith("server/")).join(", ")}). This harness did not find a function that executes an external write and checks that field, so the enforcement path is still unsupported rather than marked passed.`
    : `Not implemented. toolUseDecision is referenced in: ${toolHits.join(", ") || "nowhere"}. Nothing under server/ executes an external tool write and blocks on that field. The deterministic reviewer only returns the string.`,
  evidence: { references: toolHits },
});

await resetDirectState();
const beforeErrorHash = await stateHash();
const errorAttempt = await timed(() =>
  updateState(async (state) => {
    const run = createAssessmentRun(42);
    state.runs.unshift(run);
    // A non-string reviewer passes the gate's state read, then throws inside
    // evaluateApprovalPolicy when the check calls reviewer.trim().
    const result = await applyGateDecision(
      run,
      { state: "approved", reviewer: 12, reviewerRole: "security-reviewer", note: "non-string reviewer" },
      null,
    );
    state.runs[0] = result.run;
    state.approvals.unshift(result.approvalRecord);
    return result;
  }),
);
const afterErrorHash = await stateHash();
const afterErrorState = await loadState();
const errorBlocked = !errorAttempt.ok && afterErrorHash === beforeErrorHash && afterErrorState.approvals.length === 0 && afterErrorState.runs.length === 0;
record({
  id: "policy_check_error_does_not_persist",
  claim: "If policy evaluation throws, the approval is not persisted",
  status: errorBlocked ? "pass" : "fail",
  durationMs: errorAttempt.durationMs,
  detail: errorBlocked
    ? `Policy evaluation threw ${errorAttempt.error.name}: ${clip(errorAttempt.error.message, 180)}. The decision had a numeric reviewer, so evaluateApprovalPolicy crashed on reviewer.trim() after the policy file had loaded. updateState did not save. The state file hash was unchanged. This is an exception abort, not a dedicated policy-error result.`
    : `Expected a throw and an unchanged state file. threw=${!errorAttempt.ok} hashUnchanged=${afterErrorHash === beforeErrorHash} approvals=${afterErrorState.approvals.length}.`,
  evidence: {
    threw: !errorAttempt.ok,
    errorName: errorAttempt.ok ? null : errorAttempt.error.name,
    message: errorAttempt.ok ? null : clip(errorAttempt.error.message, 240),
    stateFileUnchanged: afterErrorHash === beforeErrorHash,
    approvals: afterErrorState.approvals.length,
    runs: afterErrorState.runs.length,
  },
});

await resetDirectState();
const beforeMissingHash = await stateHash();
await rename(policyFile, hiddenPolicy);
let missingAttempt;
try {
  missingAttempt = await timed(() =>
    updateState(async (state) => {
      const run = createAssessmentRun(43);
      state.runs.unshift(run);
      const result = await applyGateDecision(run, goodDecision, null);
      state.approvals.unshift(result.approvalRecord);
      return result;
    }),
  );
} finally {
  if (existsSync(hiddenPolicy)) await rename(hiddenPolicy, policyFile);
}
const afterMissingHash = await stateHash();
const afterMissingState = await loadState();
const missingBlocked =
  missingAttempt &&
  !missingAttempt.ok &&
  afterMissingHash === beforeMissingHash &&
  afterMissingState.approvals.length === 0;
record({
  id: "missing_policy_file_does_not_persist",
  claim: "If the approval policy file is missing, the approval is not persisted",
  status: missingBlocked ? "pass" : "fail",
  durationMs: missingAttempt?.durationMs || 0,
  detail: missingBlocked
    ? `With server/policies/agent-action-policy.json moved aside, policy load threw ${missingAttempt.error.code || missingAttempt.error.name}. The state file was not rewritten. The file was restored afterward.`
    : "The missing-policy-file case did not fail closed.",
  evidence: {
    threw: Boolean(missingAttempt && !missingAttempt.ok),
    errorCode: missingAttempt && !missingAttempt.ok ? missingAttempt.error.code || missingAttempt.error.name : null,
    stateFileUnchanged: afterMissingHash === beforeMissingHash,
    approvals: afterMissingState.approvals.length,
    restored: existsSync(policyFile) && !existsSync(hiddenPolicy),
  },
});

const policySource = readFileSync(fileURLToPath(new URL("../../server/policy-engine.mjs", import.meta.url)), "utf8");
const pacSource = readFileSync(fileURLToPath(new URL("../../server/policy-as-code.mjs", import.meta.url)), "utf8");
const timeoutImplemented = /timeout|AbortSignal|setTimeout|deadline/i.test(policySource + pacSource);
record({
  id: "policy_check_timeout_fail_closed",
  claim: "A policy check that exceeds a deadline is aborted and the write is refused",
  status: "unsupported",
  detail: timeoutImplemented
    ? "The policy modules mention a timer or abort signal. This harness did not find a caller-facing deadline on evaluateApprovalPolicy, so a timeout failure was not simulated."
    : "Not implemented. server/policy-engine.mjs and server/policy-as-code.mjs do not take a timeout, AbortSignal, or deadline. A hung check is not interrupted by product code. No timeout was faked.",
  evidence: {
    filesInspected: ["server/policy-engine.mjs", "server/policy-as-code.mjs"],
    timeoutApiPresent: timeoutImplemented,
  },
});

await resetDirectState();
const storeBefore = await stateHash();
const overwritten = await loadState();
overwritten.approvals.push({
  id: "approval-overwrite",
  reviewer: "Security Reviewer",
  previousHash: null,
  signature: "11".repeat(32),
});
let storeThrew = false;
try {
  const { saveState } = await import("../../server/store.mjs");
  await saveState(overwritten);
} catch {
  storeThrew = true;
}
const storeAfter = await loadState();
record({
  id: "storage_rejects_historical_edit",
  claim: "The local state store rejects an in-place edit of an approval (append-only enforcement)",
  status: "unsupported",
  detail: storeThrew
    ? "saveState threw. A rejection exists, but this harness did not classify it as a passing append-only control without confirming the reason."
    : "Not implemented. createLocalJsonStore.saveState rewrote the whole JSON document when an approval was inserted, and loadState returned it. The README calls the ledger append-only. The local adapter does not refuse historical edits. Detection, when it works, happens later in verifyApprovalLedger.",
  evidence: {
    saveThrew: storeThrew,
    approvalsAfter: storeAfter.approvals.length,
    hashChanged: storeBefore !== (await stateHash()),
  },
});

const map = JSON.parse(readFileSync(join(root, "standard/conformance-map.json"), "utf8"));
const liveReport = JSON.parse(readFileSync(join(root, "standard/conformance-report.json"), "utf8"));
const crosswalk = JSON.parse(readFileSync(join(root, "standard/crosswalk.json"), "utf8"));
const flipped = structuredClone(liveReport);
const flipTarget = flipped.requirements.find((item) => item.status === "Pass") || flipped.requirements[0];
flipTarget.status = "Fail";
const flippedControls = buildControlImplementations(map, flipped, crosswalk);
const flippedPoam = buildPoam(flipped, []);
const affected = flippedControls.filter((control) => control.requirements.some((item) => item.id === flipTarget.id));
const notMarkedImplemented = affected.length > 0 && affected.every((control) => control.implemented === false);
const poamListsIt = flippedPoam.entries.some((entry) => entry.item.startsWith(flipTarget.id));
record({
  id: "non_pass_requirement_not_marked_implemented",
  claim: "A requirement marked Fail is not rendered as a fully implemented NIST control, and it appears on the POA&M",
  status: notMarkedImplemented && poamListsIt ? "pass" : "fail",
  detail:
    notMarkedImplemented && poamListsIt
      ? `Flipped ${flipTarget.id} to Fail in a copy of the conformance report. ${affected.length} mapped control(s) have implemented=false, and the POA&M lists the requirement. The generator was not told to hide it.`
      : `Flip of ${flipTarget.id} did not surface as expected. implementedOk=${notMarkedImplemented} poam=${poamListsIt}.`,
  evidence: {
    requirement: flipTarget.id,
    affectedControls: affected.map((control) => control.control),
    poamEntry: poamListsIt,
  },
});

const allPass = structuredClone(liveReport);
for (const requirement of allPass.requirements) requirement.status = "Pass";
const trusted = buildControlImplementations(map, allPass, crosswalk);
const trustsStatus = trusted.length > 0 && trusted.every((control) => control.implemented === true);
record({
  id: "compliance_generator_reexecutes_checks",
  claim: "Compliance evidence re-runs the conformance checks before marking a control Implemented",
  status: "unsupported",
  detail: trustsStatus
    ? `Not implemented. buildControlImplementations was given a report copy with every requirement forced to Pass. All ${trusted.length} mapped controls came back implemented=true. No conformance script was executed. The generator trusts the status strings it is given.`
    : "The forced-pass report was not marked fully implemented. See evidence before treating that as re-execution.",
  evidence: {
    controls: trusted.length,
    allImplemented: trustsStatus,
    checksExecuted: false,
  },
});

const gapPoam = buildPoam(liveReport, DEFAULT_AUTHORIZATION_GAPS);
const has3pao = gapPoam.entries.some((entry) => entry.external && /3PAO/i.test(entry.item));
const conmon = buildContinuousMonitoringPlan(map);
record({
  id: "poam_keeps_external_authorization_gaps",
  claim: "The POA&M keeps the stated external authorization gaps, including independent assessment",
  status: has3pao && conmon.items.length === map.requirements.length ? "pass" : "fail",
  detail: has3pao
    ? `buildPoam includes an external 3PAO gap from DEFAULT_AUTHORIZATION_GAPS. The continuous-monitoring plan lists ${conmon.items.length} requirements, matching the conformance map. Live report open findings: ${liveReport.requirements.filter((item) => item.status !== "Pass").length}.`
    : "The external 3PAO gap was not present on the generated POA&M.",
  evidence: {
    externalGaps: gapPoam.entries.filter((entry) => entry.external).map((entry) => entry.item),
    conmonItems: conmon.items.length,
    mapRequirements: map.requirements.length,
    liveOpenFindings: liveReport.requirements.filter((item) => item.status !== "Pass").length,
  },
});

const httpPort = 4187;
const httpLog = [];
let httpServer = null;
async function stopHttp() {
  if (!httpServer) return;
  httpServer.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 1500);
    httpServer.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  httpServer = null;
}

function startHttp() {
  httpServer = spawn(process.execPath, ["server/index.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      SENTINELOPS_AUTH_MODE: "local-dev",
      SENTINELOPS_API_HOST: "127.0.0.1",
      SENTINELOPS_API_PORT: String(httpPort),
      SENTINELOPS_LOCAL_STATE_PATH: httpStatePath,
      SENTINELOPS_LOCAL_EVIDENCE_PATH: join(work, "http-evidence", "/"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  httpServer.stdout.on("data", (chunk) => httpLog.push(chunk.toString()));
  httpServer.stderr.on("data", (chunk) => httpLog.push(chunk.toString()));
}

async function waitForHttp() {
  for (let i = 0; i < 40; i += 1) {
    if (httpLog.join("").includes("listening on")) {
      const health = await api("/health");
      if (health.status === 200) return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

async function api(path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${httpPort}/api${path}`, {
    method: options.method || "GET",
    headers: { "content-type": "application/json" },
    body: options.body,
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

let httpReady = false;
try {
  startHttp();
  httpReady = await waitForHttp();
} catch (error) {
  httpLog.push(String(error));
}

if (!httpReady) {
  const why = clip(httpLog.join("\n"), 500);
  for (const id of ["http_clean_chain_verifies", "http_disk_edit_detected", "http_sensitive_payload_blocked"]) {
    record({
      id,
      claim: "HTTP check against the local API",
      status: "fail",
      detail: `The harness API did not become healthy on 127.0.0.1:${httpPort}. ${why}`,
    });
  }
} else {
  const created = [];
  for (let i = 0; i < 3; i += 1) {
    const made = await api("/runs", { method: "POST", body: "{}" });
    const approved = await api(`/runs/${made.body.run.id}/approval`, {
      method: "POST",
      body: JSON.stringify({ state: "approved", note: "http chain" }),
    });
    created.push({ create: made.status, approve: approved.status, id: made.body?.run?.id });
  }
  const integrity = await api("/audit/integrity");
  const httpClean =
    created.every((item) => item.create === 201 && item.approve === 200) &&
    integrity.status === 200 &&
    integrity.body?.approvalLedger?.passed === true &&
    integrity.body?.approvalLedger?.total === 3;
  record({
    id: "http_clean_chain_verifies",
    claim: "POST /api/runs and POST /api/runs/:id/approval produce a ledger GET /api/audit/integrity accepts",
    status: httpClean ? "pass" : "fail",
    detail: httpClean
      ? "Three local-dev approvals were stored by the real server and the integrity endpoint reported the ledger passed."
      : `Create/approve statuses ${JSON.stringify(created)}; integrity HTTP ${integrity.status} passed=${integrity.body?.approvalLedger?.passed} total=${integrity.body?.approvalLedger?.total}.`,
    evidence: {
      created,
      total: integrity.body?.approvalLedger?.total ?? null,
      passed: integrity.body?.approvalLedger?.passed ?? null,
    },
  });

  const disk = JSON.parse(await readFile(httpStatePath, "utf8"));
  disk.approvals[1].reviewer = "Edited Reviewer";
  await writeFile(httpStatePath, `${JSON.stringify(disk, null, 2)}\n`);
  const afterEdit = await api("/audit/integrity");
  const editCaught = afterEdit.status === 200 && afterEdit.body?.approvalLedger?.passed === false;
  record({
    id: "http_disk_edit_detected",
    claim: "GET /api/audit/integrity reports failure after an approval field is edited on disk",
    status: editCaught ? "pass" : "fail",
    detail: editCaught
      ? `The API reread the state file and verifyApprovalLedger returned passed=false. validSignatures=${afterEdit.body.approvalLedger.validSignatures} of ${afterEdit.body.approvalLedger.total}.`
      : `Integrity after the disk edit: HTTP ${afterEdit.status} passed=${afterEdit.body?.approvalLedger?.passed}.`,
    evidence: {
      passed: afterEdit.body?.approvalLedger?.passed ?? null,
      validSignatures: afterEdit.body?.approvalLedger?.validSignatures ?? null,
      total: afterEdit.body?.approvalLedger?.total ?? null,
    },
  });

  const beforeSensitive = existsSync(httpStatePath) ? JSON.parse(await readFile(httpStatePath, "utf8")).runs.length : 0;
  const sensitive = await api("/runs", {
    method: "POST",
    body: JSON.stringify({ note: "synthetic ssn pattern 123-45-6789" }),
  });
  const afterSensitive = JSON.parse(await readFile(httpStatePath, "utf8")).runs.length;
  const categories = Array.isArray(sensitive.body?.dataProtection?.findings)
    ? [...new Set(sensitive.body.dataProtection.findings.map((finding) => finding.category))]
    : [];
  const sensitiveBlocked = sensitive.status === 422 && afterSensitive === beforeSensitive && categories.includes("ssn");
  record({
    id: "http_sensitive_payload_blocked",
    claim: "A mutating request containing an SSN-shaped string is rejected before it is stored",
    status: sensitiveBlocked ? "pass" : "fail",
    detail: sensitiveBlocked
      ? `POST /api/runs returned 422 and the run count stayed ${beforeSensitive}. Category reported: ssn. The raw string was not copied into this result. This block is the pilot data-boundary scanner, not the AI policy gate.`
      : `Expected 422 and an unchanged run count. HTTP ${sensitive.status}, runs ${beforeSensitive} -> ${afterSensitive}, categories ${categories.join(",")}.`,
    evidence: {
      httpStatus: sensitive.status,
      runsBefore: beforeSensitive,
      runsAfter: afterSensitive,
      categories,
    },
  });
}

await stopHttp();
await writeFile(fileURLToPath(new URL("../logs/harness-api.log", import.meta.url)), httpLog.join(""));

let boundaryThrew = false;
try {
  assertPilotDataBoundary({ note: "synthetic ssn pattern 123-45-6789" });
} catch (error) {
  boundaryThrew = error.statusCode === 422;
}
if (!tests.some((test) => test.id === "http_sensitive_payload_blocked" && test.status === "pass") && !boundaryThrew) {
  record({
    id: "data_boundary_function_blocks_ssn_pattern",
    claim: "assertPilotDataBoundary throws on an SSN-shaped string",
    status: "fail",
    detail: "Neither the HTTP server nor assertPilotDataBoundary blocked the synthetic SSN pattern.",
  });
}

const demo = {
  chain: story.map((entry, index) => viewRecord(entry, index, story.length)),
  clean: {
    status: cleanPass ? "pass" : "fail",
    passed: cleanLedger.passed,
    checks: cleanLedger.checks.map(slimCheck),
  },
  edit: {
    status: detected(editedLedger) ? "pass" : "fail",
    index: 2,
    id: edited[2].id,
    field: "reviewer",
    from: editedFrom,
    to: "Edited Reviewer",
    passed: editedLedger.passed,
    checks: editedLedger.checks.map(slimCheck),
  },
  deleteMiddle: {
    status: detected(deletedMiddleLedger) ? "pass" : "fail",
    removedIndex: 2,
    removedId: story[2].id,
    passed: deletedMiddleLedger.passed,
    checks: deletedMiddleLedger.checks.map(slimCheck),
  },
  headTruncation: {
    status: detected(headLedger) ? "pass" : "fail",
    droppedId: story[0].id,
    passed: headLedger.passed,
    detail: tests.find((test) => test.id === "head_truncation_detected")?.detail || "",
  },
  volume: tests.find((test) => test.id === "volume_10k_chain")?.evidence || null,
  failClosed: {
    policyError: tests.find((test) => test.id === "policy_check_error_does_not_persist"),
    missingPolicy: tests.find((test) => test.id === "missing_policy_file_does_not_persist"),
    policyViolation: tests.find((test) => test.id === "policy_violating_write_blocked"),
    reviewer: tests.find((test) => test.id === "reviewer_refuses_scoped_write_when_evidence_missing"),
    timeout: tests.find((test) => test.id === "policy_check_timeout_fail_closed"),
    sensitiveWrite: tests.find((test) => test.id === "http_sensitive_payload_blocked"),
  },
};

const payload = { tests, demo };
const { mkdirSync } = await import("node:fs");
mkdirSync(fileURLToPath(new URL("../logs/", import.meta.url)), { recursive: true });
await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);
restorePolicySync();

const summary = tests.reduce(
  (acc, test) => {
    acc[test.status] += 1;
    return acc;
  },
  { pass: 0, fail: 0, unsupported: 0 },
);
console.log(JSON.stringify({ summary, ids: tests.map((test) => `${test.status} ${test.id}`) }, null, 2));
