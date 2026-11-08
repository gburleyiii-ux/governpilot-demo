import { createHash, createHmac } from "node:crypto";
import { buildEvidencePacket } from "./assessment-engine.mjs";
import { DEV_SIGNING_KEY, evaluateSigningPosture, resolveSigningSecret, signatureModeFor } from "./signing-guard.mjs";

function signingSecret(env = process.env) {
  return resolveSigningSecret(env);
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

function hmacHex(value, secret) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function signApprovalPayload(payload, previousHash, env = process.env) {
  const signaturePayload = JSON.stringify({ payload, previousHash });
  return hmacHex(signaturePayload, signingSecret(env));
}

function devKeySignature(payload, previousHash) {
  return hmacHex(JSON.stringify({ payload, previousHash }), DEV_SIGNING_KEY);
}

// Production-like verification must not accept a chain signed with the public
// development key. Local/dev verification still accepts it so the demo runs.
function rejectsDevKeyMaterial(signature, devSignature, signatureMode, env) {
  const posture = evaluateSigningPosture(env);
  if (!posture.productionLike) return false;
  return signature === devSignature || signatureMode === "local-dev-hmac-sha256";
}

export function verifyApprovalSignature(record, env = process.env) {
  const payload = approvalPayload(record);
  const previousHash = record.previousHash || null;
  const devSignature = devKeySignature(payload, previousHash);
  const devKeyRejected = rejectsDevKeyMaterial(record.signature, devSignature, record.signatureMode, env);
  let signatureValid = false;
  if (!devKeyRejected) {
    try {
      signatureValid = record.signature === signApprovalPayload(payload, previousHash, env);
    } catch {
      signatureValid = false;
    }
  }
  return {
    id: record.id,
    runId: record.runId,
    decidedAt: record.decidedAt,
    reviewer: record.reviewer,
    reviewerRole: record.reviewerRole,
    signature: record.signature,
    previousHash,
    signatureValid,
    devKeyRejected,
  };
}

export function sealLedgerAnchor(approvals = [], env = process.env) {
  const body = {
    version: 1,
    length: approvals.length,
    headSignature: approvals[0]?.signature || null,
  };
  return {
    ...body,
    signatureMode: signatureModeFor(env),
    signature: hmacHex(canonicalJson(body), signingSecret(env)),
  };
}

function verifyLedgerAnchor(approvals, anchor, env) {
  if (!anchor) {
    return { checked: false, valid: true, reason: "no-anchor" };
  }
  const body = {
    version: anchor.version,
    length: anchor.length,
    headSignature: anchor.headSignature ?? null,
  };
  const devSignature = hmacHex(canonicalJson(body), DEV_SIGNING_KEY);
  if (rejectsDevKeyMaterial(anchor.signature, devSignature, anchor.signatureMode, env)) {
    return { checked: true, valid: false, reason: "dev-key-anchor" };
  }
  let signatureValid = false;
  try {
    signatureValid = anchor.signature === hmacHex(canonicalJson(body), signingSecret(env));
  } catch {
    signatureValid = false;
  }
  const headOk = (anchor.headSignature || null) === (approvals[0]?.signature || null);
  const lengthOk = anchor.length === approvals.length;
  const valid = signatureValid && headOk && lengthOk;
  return {
    checked: true,
    valid,
    signatureValid,
    headOk,
    lengthOk,
    reason: valid ? "match" : !signatureValid ? "anchor-signature" : !lengthOk ? "length" : "head",
  };
}

export function verifyApprovalLedger(approvals = [], anchor = null, env = process.env) {
  const checks = approvals.map((approval, index) => {
    const signatureCheck = verifyApprovalSignature(approval, env);
    const expectedPreviousHash = approvals[index + 1]?.signature || null;
    return {
      ...signatureCheck,
      chainLinkValid: (approval.previousHash || null) === expectedPreviousHash,
      expectedPreviousHash,
    };
  });
  const anchorResult = verifyLedgerAnchor(approvals, anchor, env);
  const chainIntact = approvals.length > 0 && checks.every((check) => check.signatureValid && check.chainLinkValid);
  return {
    total: approvals.length,
    validSignatures: checks.filter((check) => check.signatureValid).length,
    validChainLinks: checks.filter((check) => check.chainLinkValid).length,
    passed: chainIntact && anchorResult.valid,
    empty: approvals.length === 0,
    anchor: anchorResult,
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
  const globalLedger = verifyApprovalLedger(state.approvals, state.approvalLedgerAnchor || null);
  const runApprovalSignatures = approvals.map(verifyApprovalSignature);

  const generatedAt = new Date().toISOString();
  const manifest = {
    manifestVersion: "sentinelops-evidence-manifest/v1",
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
    generatedAt,
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

  const generatedAt = new Date().toISOString();
  const exportPayload = {
    exportVersion: "sentinelops-full-audit-export/v1",
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
      approvalLedger: verifyApprovalLedger(approvals, state.approvalLedgerAnchor || null),
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
    generatedAt,
    ...exportPayload,
    exportSha256: sha256(canonicalJson(exportPayload)),
  };
}
