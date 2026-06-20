import { applyGateDecision, createAssessmentRun } from "../server/assessment-engine.mjs";
import {
  buildEvidenceBundle,
  buildEvidenceManifest,
  buildFullAuditExport,
  verifyApprovalLedger,
} from "../server/audit-integrity.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const firstRun = createAssessmentRun(1001);
const firstDecision = {
  state: "approved",
  reviewer: "Grant Burley III",
  reviewerRole: "security-reviewer",
  note: "Audit integrity smoke approval one.",
};
const first = await applyGateDecision(firstRun, firstDecision, null);

const secondRun = createAssessmentRun(1002);
const secondDecision = {
  state: "denied",
  reviewer: "Grant Burley III",
  reviewerRole: "compliance-analyst",
  note: "Audit integrity smoke denial two.",
};
const second = await applyGateDecision(secondRun, secondDecision, first.approvalRecord.signature);

const state = {
  sequence: 1002,
  runs: [second.run, first.run],
  approvals: [second.approvalRecord, first.approvalRecord],
  policyChecks: [
    { ...second.policyResult, runId: second.run.id, traceId: second.run.traceId },
    { ...first.policyResult, runId: first.run.id, traceId: first.run.traceId },
  ],
  agentReviews: [
    {
      id: "agent-review-audit-smoke",
      runId: second.run.id,
      traceId: second.run.traceId,
      reviewedAt: new Date().toISOString(),
      mode: "deterministic-local",
      recommendation: "block",
      toolUseDecision: "approval-required",
      confidence: 0.81,
      summary: "Synthetic audit integrity review.",
      requiredActions: [],
      riskDeltas: [],
      evalFocus: [],
      citations: [],
      traceNotes: [],
    },
  ],
  auditEvents: [
    {
      id: "audit-smoke-2",
      at: new Date().toISOString(),
      runId: second.run.id,
      event: "Synthetic audit event two.",
    },
    {
      id: "audit-smoke-1",
      at: new Date().toISOString(),
      runId: first.run.id,
      event: "Synthetic audit event one.",
    },
  ],
  alertDispatches: [
    {
      id: "dispatch-audit-smoke",
      routedAt: new Date().toISOString(),
      alertId: "monitoring-clear",
      alertTitle: "No active SentinelOps alerts",
      alertSeverity: "info",
      runId: second.run.id,
      routeId: "siem-ocsf",
      routeLabel: "SIEM Evidence Export",
      target: "siem",
      destination: "local://siem/sentinelops",
      deliveryMode: "simulated",
      deliveryStatus: "simulated-delivered",
      actorName: "Grant Burley III",
      actorRole: "security-reviewer",
      signingMode: "local-dev-hmac-sha256",
      summaryHash: "1".repeat(64),
      previousHash: null,
      signature: "2".repeat(64),
    },
  ],
};

const ledger = verifyApprovalLedger(state.approvals);
assert(ledger.passed, "expected approval ledger hash chain to pass");
assert(ledger.validSignatures === 2, `expected 2 valid signatures, received ${ledger.validSignatures}`);
assert(ledger.validChainLinks === 2, `expected 2 valid chain links, received ${ledger.validChainLinks}`);

const manifest = buildEvidenceManifest(state, second.run.id);
assert(manifest, "expected evidence manifest to be created");
assert(manifest.packet.sha256.length === 64, "expected packet sha256 hash");
assert(manifest.manifestSha256.length === 64, "expected manifest sha256 hash");
assert(manifest.approvalLedger.runApprovalsValid, "expected run approval signature to be valid");
assert(manifest.approvalLedger.globalLedgerValid, "expected global ledger to be valid");
assert(manifest.auditCompleteness.hasApproval, "expected manifest to show approval completeness");
assert(manifest.auditCompleteness.hasPolicyCheck, "expected manifest to show policy completeness");
assert(manifest.auditCompleteness.hasAgentReview, "expected manifest to show agent-review completeness");
assert(manifest.auditCompleteness.hasAuditEvents, "expected manifest to show audit-event completeness");

const bundle = buildEvidenceBundle(state, second.run.id);
assert(bundle.evidencePacket.includes("Approval Signatures"), "expected bundle to include evidence packet markdown");
assert(bundle.manifest.packet.sha256 === manifest.packet.sha256, "expected bundle packet hash to match manifest endpoint output");
assert(bundle.manifest.manifestSha256.length === 64, "expected bundle manifest sha256 hash");

const fullExport = buildFullAuditExport(state, {
  service: "sentinelops-api",
  version: "0.22.0",
  storage: { mode: "local-json", path: "data/sentinelops-state.json" },
  authMode: "local-dev",
  agentMode: "deterministic-local",
});
assert(fullExport.exportVersion === "sentinelops-full-audit-export/v1", "expected full audit export version");
assert(fullExport.exportSha256.length === 64, "expected full audit export hash");
assert(fullExport.counts.runs === 2, "expected full export run count");
assert(fullExport.counts.alertDispatches === 1, "expected full export dispatch count");
assert(fullExport.integrity.approvalLedger.passed, "expected full export approval ledger to pass");
assert(
  fullExport.integrity.datasetHashes.some((dataset) => dataset.label === "alertDispatches" && dataset.count === 1),
  "expected full export to hash alert dispatches",
);
assert(
  fullExport.runs.some((run) => run.runId === second.run.id && run.evidenceManifestSha256?.length === 64),
  "expected full export run inventory to include manifest hashes",
);
assert(
  fullExport.retentionGuidance.dataBoundary === "portfolio-demo-nonclassified",
  "expected full export to declare data boundary",
);

const tamperedPayload = structuredClone(state.approvals);
tamperedPayload[0].reviewer = "Payload Tamper";
const tamperedPayloadLedger = verifyApprovalLedger(tamperedPayload);
assert(!tamperedPayloadLedger.passed, "expected tampered approval payload to fail");
assert(tamperedPayloadLedger.validSignatures === 1, "expected one valid signature after payload tamper");

const tamperedChain = structuredClone(state.approvals);
tamperedChain[0].previousHash = "0".repeat(64);
const tamperedChainLedger = verifyApprovalLedger(tamperedChain);
assert(!tamperedChainLedger.passed, "expected tampered approval chain to fail");
assert(tamperedChainLedger.validChainLinks === 1, "expected one valid chain link after chain tamper");

console.log(
  JSON.stringify(
    {
      ledgerPassed: ledger.passed,
      approvalCount: ledger.total,
      manifestHash: manifest.manifestSha256,
      packetHash: manifest.packet.sha256,
      evidencePacketBytes: manifest.packet.bytes,
      fullExportHash: fullExport.exportSha256,
      fullExportRunCount: fullExport.counts.runs,
      tamperedPayloadDetected: !tamperedPayloadLedger.passed,
      tamperedChainDetected: !tamperedChainLedger.passed,
    },
    null,
    2,
  ),
);
