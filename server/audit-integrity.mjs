import { createHash, createHmac } from "node:crypto";
import { buildEvidencePacket } from "./assessment-engine.mjs";
import { resolveSigningSecret, signatureModeFor } from "./signing-guard.mjs";

function signingSecret() {
  return resolveSigningSecret();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function approvalPayload(record) {
  const { signature, ...payload } = record;
  return payload;
}

export function signApprovalPayload(payload, previousHash) {
  const signaturePayload = JSON.stringify({ payload, previousHash });
  return createHmac("sha256", signingSecret()).update(signaturePayload).digest("hex");
}

export function verifyApprovalSignature(record) {
  const payload = approvalPayload(record);
  const expected = signApprovalPayload(payload, record.previousHash || null);
  return {
    id: record.id,
    runId: record.runId,
    decidedAt: record.decidedAt,
    reviewer: record.reviewer,
    reviewerRole: record.reviewerRole,
    signature: record.signature,
    previousHash: record.previousHash || null,
    signatureValid: record.signature === expected,
  };
}

export function verifyApprovalLedger(approvals = []) {
  const checks = approvals.map((approval, index) => {
    const signatureCheck = verifyApprovalSignature(approval);
    const expectedPreviousHash = approvals[index + 1]?.signature || null;
    return {
      ...signatureCheck,
      chainLinkValid: (approval.previousHash || null) === expectedPreviousHash,
      expectedPreviousHash,
    };
  });
  return {
    total: approvals.length,
    validSignatures: checks.filter((check) => check.signatureValid).length,
    validChainLinks: checks.filter((check) => check.chainLinkValid).length,
    passed: checks.every((check) => check.signatureValid && check.chainLinkValid),
    checks,
  };
}

function hashRows(label, rows) {
  return {
    label,
    count: rows.length,
    sha256: sha256(canonicalJson(rows)),
  };
}

function evidenceContext(state, runId) {
  const run = state.runs.find((candidate) => candidate.id === runId);
  if (!run) return null;

  const approvals = state.approvals.filter((approval) => approval.runId === runId);
  const policyChecks = state.policyChecks.filter((check) => check.runId === runId);
  const agentReviews = state.agentReviews.filter((review) => review.runId === runId);
  const auditEvents = state.auditEvents.filter((event) => event.runId === runId);
  const evidencePacket = buildEvidencePacket(run, approvals, policyChecks, agentReviews);
  return { run, approvals, policyChecks, agentReviews, auditEvents, evidencePacket };
}

export function buildEvidenceManifest(state, runId) {
  const context = evidenceContext(state, runId);
  if (!context) return null;

  const { run, approvals, policyChecks, agentReviews, auditEvents, evidencePacket } = context;
  const globalLedger = verifyApprovalLedger(state.approvals);
  const runApprovalSignatures = approvals.map(verifyApprovalSignature);

  const manifest = {
    manifestVersion: "sentinelops-evidence-manifest/v1",
    generatedAt: new Date().toISOString(),
    runId,
    traceId: run.traceId,
    approvalState: run.approvalState,
    signingMode: signatureModeFor(),
    packet: {
      format: "text/markdown",
      bytes: Buffer.byteLength(evidencePacket, "utf8"),
      sha256: sha256(evidencePacket),
    },
    sections: [
      hashRows("run", [run]),
      hashRows("approvals", approvals),
      hashRows("policyChecks", policyChecks),
      hashRows("agentReviews", agentReviews),
      hashRows("auditEvents", auditEvents),
    ],
    approvalLedger: {
      runApprovalCount: approvals.length,
      runApprovalsValid: runApprovalSignatures.every((check) => check.signatureValid),
      globalApprovalCount: globalLedger.total,
      globalLedgerValid: globalLedger.passed,
      checks: runApprovalSignatures,
    },
    auditCompleteness: {
      hasApproval: approvals.length > 0,
      hasPolicyCheck: policyChecks.length > 0,
      hasAgentReview: agentReviews.length > 0,
      hasAuditEvents: auditEvents.length > 0,
    },
  };

  return {
    ...manifest,
    manifestSha256: sha256(canonicalJson(manifest)),
  };
}

export function buildEvidenceBundle(state, runId) {
  const context = evidenceContext(state, runId);
  if (!context) return null;
  const manifest = buildEvidenceManifest(state, runId);
  return {
    manifest,
    evidencePacket: context.evidencePacket,
  };
}

export function buildFullAuditExport(state, metadata = {}) {
  const runs = state.runs || [];
  const approvals = state.approvals || [];
  const policyChecks = state.policyChecks || [];
  const agentReviews = state.agentReviews || [];
  const auditEvents = state.auditEvents || [];
  const alertDispatches = state.alertDispatches || [];

  const runInventory = runs.map((run) => {
    const runApprovals = approvals.filter((approval) => approval.runId === run.id);
    const runPolicyChecks = policyChecks.filter((check) => check.runId === run.id || check.traceId === run.traceId);
    const runAgentReviews = agentReviews.filter((review) => review.runId === run.id || review.traceId === run.traceId);
    const runAuditEvents = auditEvents.filter((event) => event.runId === run.id);
    const manifest = buildEvidenceManifest(state, run.id);
    return {
      runId: run.id,
      traceId: run.traceId,
      title: run.title,
      approvalState: run.approvalState,
      startedAt: run.startedAt,
      counts: {
        approvals: runApprovals.length,
        policyChecks: runPolicyChecks.length,
        agentReviews: runAgentReviews.length,
        auditEvents: runAuditEvents.length,
      },
      latestApprovalSignature: runApprovals[0]?.signature || null,
      latestPolicyStatus: runPolicyChecks[0]?.status || null,
      latestAgentRecommendation: runAgentReviews[0]?.recommendation || null,
      evidenceManifestSha256: manifest?.manifestSha256 || null,
      evidencePacketSha256: manifest?.packet.sha256 || null,
      evidencePacketBytes: manifest?.packet.bytes || 0,
      auditCompleteness: manifest?.auditCompleteness || {
        hasApproval: false,
        hasPolicyCheck: false,
        hasAgentReview: false,
        hasAuditEvents: false,
      },
    };
  });

  const exportPayload = {
    exportVersion: "sentinelops-full-audit-export/v1",
    generatedAt: new Date().toISOString(),
    service: metadata.service || "sentinelops-api",
    serviceVersion: metadata.version || "unknown",
    scope: "all-runs",
    authMode: metadata.authMode || "unknown",
    agentMode: metadata.agentMode || "unknown",
    storage: metadata.storage || null,
    counts: {
      runs: runs.length,
      approvals: approvals.length,
      policyChecks: policyChecks.length,
      agentReviews: agentReviews.length,
      auditEvents: auditEvents.length,
      alertDispatches: alertDispatches.length,
    },
    integrity: {
      approvalLedger: verifyApprovalLedger(approvals),
      datasetHashes: [
        hashRows("runs", runs),
        hashRows("approvals", approvals),
        hashRows("policyChecks", policyChecks),
        hashRows("agentReviews", agentReviews),
        hashRows("auditEvents", auditEvents),
        hashRows("alertDispatches", alertDispatches),
      ],
    },
    retentionGuidance: {
      dataBoundary: "portfolio-demo-nonclassified",
      secretPolicy: "No API keys, classified content, customer records, or raw sensitive personal data are intentionally exported.",
      recommendedControls: [
        "Store exports in encrypted object storage.",
        "Restrict export access to reviewers with export_evidence permission.",
        "Preserve full audit exports before mutating signed approval or dispatch ledgers.",
        "Regenerate exports after any policy, eval, retrieval, or evidence-packet change.",
      ],
    },
    runs: runInventory,
  };

  return {
    ...exportPayload,
    exportSha256: sha256(canonicalJson(exportPayload)),
  };
}
