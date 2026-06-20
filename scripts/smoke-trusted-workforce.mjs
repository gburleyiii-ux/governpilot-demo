import { buildTrustedWorkforceEvidence, buildTrustedWorkforceReadiness } from "../server/trusted-workforce.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function containsSecretLikeValue(value) {
  const serialized = JSON.stringify(value);
  return serialized.includes("123-45-6789") || serialized.includes("password@") || serialized.includes("sk-test-secret");
}

const synthetic = buildTrustedWorkforceReadiness({
  service: "sentinelops-api",
  version: "0.22.0",
  storage: { mode: "local-json" },
  authMode: "local-dev",
  agentMode: "deterministic-local",
  env: {},
});

assert(synthetic.status === "synthetic-ready", `expected synthetic-ready, got ${synthetic.status}`);
assert(synthetic.autoAdjudication === false, "expected no auto adjudication");
assert(synthetic.sources.some((source) => source.id === "performance-trusted-workforce-2"), "expected Trusted Workforce source");
assert(synthetic.sources.some((source) => source.id === "personnel-vetting-basics-fact-sheet"), "expected PV Basics fact sheet source");
assert(synthetic.sources.some((source) => source.id === "dcsa-nbis-agency-eapp"), "expected DCSA NBIS Agency/eApp source");
assert(synthetic.sources.every((source) => source.provenance.snapshotHash.length === 64), "expected source provenance hashes");
assert(synthetic.lifecycle.some((stage) => stage.id === "position"), "expected position lifecycle stage");
assert(synthetic.lifecycle.some((stage) => stage.id === "adjudication"), "expected adjudication lifecycle stage");
assert(synthetic.lifecycle.some((stage) => stage.id === "access"), "expected access lifecycle stage");
assert(synthetic.lifecycle.some((stage) => stage.id === "continuous-vetting"), "expected continuous vetting lifecycle stage");
assert(synthetic.procedures.every((procedure) => procedure.policySourceIds.length > 0), "expected procedure source citations");
assert(synthetic.workInstructions.length >= 8, "expected task-level work instructions");
assert(synthetic.controls.every((control) => control.passed), "expected synthetic controls to pass");
assert(
  synthetic.dataBoundary.some((boundary) => boundary.includes("Do not store SSNs")),
  "expected explicit personnel-vetting data boundary",
);
assert(
  synthetic.humanDecisionBoundary.some((boundary) => boundary.includes("Trust determination")),
  "expected human-only trust decision boundary",
);
assert(!containsSecretLikeValue(synthetic), "expected no sensitive or secret sample values");

const liveBlocked = buildTrustedWorkforceReadiness({
  service: "sentinelops-api",
  version: "0.22.0",
  storage: { mode: "aws-s3-dynamodb" },
  authMode: "oidc",
  agentMode: "deterministic-local",
  env: {
    SENTINELOPS_NBIS_LIVE_INTEGRATION_REQUESTED: "true",
  },
});

assert(liveBlocked.status === "review-required", `expected review-required, got ${liveBlocked.status}`);
assert(
  liveBlocked.controls.some((control) => control.id === "TW-NBIS-008" && !control.passed),
  "expected live NBIS request without authorization to fail TW-NBIS-008",
);

const connectorReview = buildTrustedWorkforceReadiness({
  service: "sentinelops-api",
  version: "0.22.0",
  storage: { mode: "aws-s3-dynamodb" },
  authMode: "oidc",
  agentMode: "deterministic-local",
  env: {
    SENTINELOPS_NBIS_LIVE_INTEGRATION_REQUESTED: "true",
    SENTINELOPS_NBIS_LIVE_INTEGRATION_AUTHORIZED: "true",
    SENTINELOPS_NBIS_ACCOUNT_BOUNDARY_APPROVED: "true",
    SENTINELOPS_TRUSTED_WORKFORCE_OWNER: "Customer FSO",
  },
});

assert(connectorReview.status === "connector-review-ready", `expected connector-review-ready, got ${connectorReview.status}`);
assert(connectorReview.controls.every((control) => control.passed), "expected connector-review controls to pass");
assert(!containsSecretLikeValue(connectorReview), "expected no connector secret disclosure");

const evidence = buildTrustedWorkforceEvidence({
  service: "sentinelops-api",
  version: "0.22.0",
  storage: { mode: "local-json" },
  authMode: "local-dev",
  agentMode: "deterministic-local",
  env: {},
});

assert(evidence.evidencePacket.evidenceSha256.length === 64, "expected evidence packet hash");
assert(evidence.evidenceMarkdown.includes("Trusted Workforce Readiness Evidence"), "expected markdown evidence");
assert(evidence.evidenceMarkdown.includes("No live NBIS data"), "expected markdown data boundary");

console.log(
  JSON.stringify(
    {
      syntheticStatus: synthetic.status,
      liveBlockedStatus: liveBlocked.status,
      connectorReviewStatus: connectorReview.status,
      sourceCount: synthetic.counts.sources,
      lifecycleStages: synthetic.counts.lifecycleStages,
      procedures: synthetic.counts.procedures,
      workInstructions: synthetic.counts.workInstructions,
      controlsPassing: `${synthetic.counts.passingControls}/${synthetic.counts.totalControls}`,
      evidenceSha256: evidence.evidencePacket.evidenceSha256,
      noAutoAdjudication: synthetic.autoAdjudication === false,
      noSensitiveSampleDisclosure: !containsSecretLikeValue(synthetic) && !containsSecretLikeValue(connectorReview),
    },
    null,
    2,
  ),
);
