// GAGS-HEALTH run lifecycle — turns a health AI deployment decision into a
// PERSISTED, SIGNED, AUDITED run with a hash-chained approval ledger.
//
// PHI BOUNDARY (hard rule): a de-identification *sample* may be SUBMITTED for
// evaluation, but the raw sample text is NEVER stored on the run and NEVER
// returned to a caller. Only the evaluation RESULT (passed / method / residual
// detected categories / requires-human-review categories) is persisted. This
// module strips the sample at the boundary so no live PHI can leak into state,
// the evidence packet, or any API response.

import { createHash, createHmac } from "node:crypto";
import {
  buildHealthGovernanceReadiness,
  routeFdaDeviceTrack,
} from "./health-governance.mjs";
import { buildHealthOverlayReadiness } from "./health-overlays.mjs";
import {
  signApprovalPayload,
  verifyApprovalLedger,
} from "./audit-integrity.mjs";
import { resolveSigningSecret, signatureModeFor } from "./signing-guard.mjs";

export const healthRunVersion = "governpilot-health-run/v1";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nextId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Sign the run record the same way assessment approvals are signed: HMAC-SHA256
// over { payload, previousHash } with the shared signing resolver (never the
// inline dev key). The signature itself is excluded from the signed payload.
function signRunRecord(payload, previousHash) {
  const secret = resolveSigningSecret();
  const signaturePayload = JSON.stringify({ payload, previousHash });
  return createHmac("sha256", secret).update(signaturePayload).digest("hex");
}

// Defense-in-depth: assert a persisted/returned object carries no raw de-id
// sample. Throws if a `sample` (or `deidentification.sample`) field survived the
// boundary stripping. Called before anything is written to state or returned.
export function assertNoRawSample(record) {
  const offenders = [];
  const visit = (node, path) => {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "sample" && typeof value === "string" && value.length > 0) {
        offenders.push(path ? `${path}.${key}` : key);
      }
      if (value && typeof value === "object") {
        visit(value, path ? `${path}.${key}` : key);
      }
    }
  };
  visit(record, "");
  if (offenders.length > 0) {
    throw Object.assign(
      new Error(`PHI boundary violation: raw de-id sample present at ${offenders.join(", ")}`),
      { code: "PHI_BOUNDARY_VIOLATION", statusCode: 500 },
    );
  }
  return true;
}

// Normalize de-id input so the raw sample is consumed for evaluation but never
// retained. Returns ONLY the safe evaluation result (no sample text).
function evaluateDeidWithoutRetainingSample(deidentification) {
  if (!deidentification || typeof deidentification !== "object") {
    return { provided: false, passed: null, result: null };
  }
  // buildHealthGovernanceReadiness runs evaluateDeidentification internally and
  // returns a result that contains residual *categories* only (never values).
  // We pass the sample THROUGH the evaluator but keep only its result object.
  return { provided: true };
}

// Build a persisted health run from a request body. PURE except for id/clock —
// no state writes here. Composes the grounded health governance + FDA + overlay
// evaluators and signs the resulting record into the hash chain.
export function buildHealthRun({ body = {}, actor, sequence = 1, previousRunHash = null, tenantId = "gp-default" } = {}) {
  const segment = typeof body.segment === "string" && body.segment.trim() ? body.segment.trim() : "administrative";
  const useCase = body.useCase && typeof body.useCase === "object" ? body.useCase : {};
  // The raw sample is used ONLY to compute the evaluation result and is dropped
  // immediately afterward. It is never assigned onto the run record.
  const deidInput = body.deidentification && typeof body.deidentification === "object" ? body.deidentification : null;

  const governance = buildHealthGovernanceReadiness({
    segment,
    useCase,
    deidentification: deidInput,
  });
  const fdaRouting = routeFdaDeviceTrack(useCase);
  const overlays = buildHealthOverlayReadiness(segment);

  // governance.deidentification already strips raw values (categories only).
  const deidResult = governance.deidentification;

  const createdAt = new Date().toISOString();
  const suffix = String(sequence).padStart(2, "0");

  const payload = {
    id: `health-run-${suffix}-${Date.now().toString(36)}`,
    healthRunVersion,
    createdAt,
    // Tenant binding is part of the signed payload (GAGS IA-4) so isolation is
    // tamper-evident, not just a runtime filter.
    tenantId: typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : "gp-default",
    createdBy: actor?.name || "unknown",
    createdByRole: actor?.role || "unknown",
    segment,
    // Persist the four FDA criteria booleans (no PHI).
    useCase: {
      notSignalOrImage: useCase.notSignalOrImage === true,
      displaysMedicalInfo: useCase.displaysMedicalInfo === true,
      recommendationsOnly: useCase.recommendationsOnly === true,
      independentReview: useCase.independentReview === true,
    },
    fdaRouting,
    // Result ONLY — method + passed + residual categories, never the sample text.
    deidentification: deidResult
      ? {
          provided: true,
          method: deidResult.method || null,
          passed: deidResult.passed,
          basis: deidResult.basis || null,
          residualDetectedCategories: deidResult.detail?.residualDetectedCategories || [],
          requiresHumanReviewCategories: deidResult.detail?.requiresHumanReviewCategories || [],
          machineClean: deidResult.detail?.machineClean ?? null,
          evidence: deidResult.evidence || null,
        }
      : { provided: false, passed: null },
    governance: {
      readinessVersion: governance.readinessVersion,
      hipaaControls: governance.hipaaControls,
      forwardLookingControls: governance.forwardLookingControls,
      applicableRegimes: governance.applicableRegimes,
      inForceReady: governance.inForceReady,
      postureHash: governance.postureHash,
    },
    overlays,
    approvalState: "pending",
    previousHash: previousRunHash || null,
    signatureMode: signatureModeFor(),
  };

  // Defense-in-depth: never sign or persist a record that carries a raw sample.
  assertNoRawSample(payload);

  payload.signature = signRunRecord(payload, previousRunHash || null);
  payload.recordHash = sha256(JSON.stringify(payload));
  return payload;
}

// Build a signed, hash-chained approval bound to a health run. Reuses the same
// signApprovalPayload chain used by assessment approvals so the combined ledger
// verifies under verifyApprovalLedger.
export function buildHealthApproval({ run, decision, actor, previousApprovalHash = null }) {
  const record = {
    id: nextId("health-approval"),
    runId: run.id,
    traceId: run.id,
    state: decision.state,
    reviewer: actor.name,
    reviewerRole: actor.role,
    note: decision.note || "Health run reviewer decision recorded.",
    decidedAt: new Date().toISOString(),
    fdaTrack: run.fdaRouting?.track || null,
    deidPassed: run.deidentification?.passed ?? null,
    previousHash: previousApprovalHash || null,
    signatureMode: signatureModeFor(),
  };
  record.signature = signApprovalPayload(record, previousApprovalHash || null);
  return record;
}

// Apply an approval decision to a health run, returning the updated run.
export function applyHealthApproval(run, approvalRecord) {
  return {
    ...run,
    approvalState: approvalRecord.state,
    decidedAt: approvalRecord.decidedAt,
    latestApprovalSignature: approvalRecord.signature,
  };
}

// Content-addressed evidence packet mapping the run to HIPAA / FDA / overlay
// controls. No PHI: only de-id result categories and control posture. Hashed so
// it is content-addressable, and signed for tamper-evidence.
export function buildHealthEvidencePacket(run, approvals = []) {
  const ledger = verifyApprovalLedger(approvals);

  const content = {
    packetVersion: "governpilot-health-evidence-packet/v1",
    generatedAt: new Date().toISOString(),
    runId: run.id,
    segment: run.segment,
    signingMode: signatureModeFor(),
    fda: {
      track: run.fdaRouting?.track || null,
      isDevice: run.fdaRouting?.isDevice ?? null,
      failedCriteria: run.fdaRouting?.failedCriteria || [],
      basis: run.fdaRouting?.basis || null,
      deviceTrackControls: run.fdaRouting?.deviceTrackControls || [],
    },
    hipaa: {
      controls: run.governance?.hipaaControls || [],
      inForceReady: run.governance?.inForceReady ?? null,
      forwardLooking: run.governance?.forwardLookingControls || [],
    },
    deidentification: run.deidentification || { provided: false },
    overlays: {
      inForce: run.overlays?.inForce || [],
      future: run.overlays?.future || [],
      sourceIdentified: run.overlays?.sourceIdentified || [],
    },
    approvals: approvals.map((a) => ({
      id: a.id,
      state: a.state,
      reviewer: a.reviewer,
      reviewerRole: a.reviewerRole,
      decidedAt: a.decidedAt,
      signature: a.signature,
      previousHash: a.previousHash || null,
    })),
    approvalLedger: {
      total: ledger.total,
      validSignatures: ledger.validSignatures,
      validChainLinks: ledger.validChainLinks,
      passed: ledger.passed,
    },
    runSignature: run.signature,
    runRecordHash: run.recordHash || null,
    phiBoundary:
      "Content-addressed evidence packet. Contains de-identification RESULT categories and control posture only; no live PHI, no raw de-id sample.",
  };

  // Defense-in-depth before hashing/returning.
  assertNoRawSample(content);

  const packetSha256 = sha256(JSON.stringify(content));
  const packet = {
    ...content,
    packetSha256,
    packetSignature: signRunRecord({ ...content, packetSha256 }, run.signature || null),
  };
  return packet;
}

export { verifyApprovalLedger };
