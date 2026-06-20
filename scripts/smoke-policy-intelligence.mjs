import { buildPolicyIntelligenceStatus } from "../server/policy-intelligence.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const simulated = await buildPolicyIntelligenceStatus({
  env: {
    SENTINELOPS_POLICY_INTEL_MODE: "simulated",
  },
});

assert(simulated.status === "simulated-watch-ready", `expected simulated-watch-ready, got ${simulated.status}`);
assert(simulated.sources.length >= 7, "expected official and customer policy source registry");
assert(simulated.sources.some((source) => source.id === "nist-oscal-sp800-53"), "expected NIST OSCAL source");
assert(simulated.sources.some((source) => source.id === "fedramp-automation"), "expected FedRAMP automation source");
assert(simulated.sources.some((source) => source.id === "ecfr-api"), "expected eCFR API source");
assert(simulated.sources.some((source) => source.id === "federal-register-api"), "expected Federal Register API source");
assert(simulated.sources.some((source) => source.id === "cisa-kev"), "expected CISA KEV source");
assert(simulated.sources.every((source) => source.provenance.snapshotHash.length === 64), "expected SHA-256 provenance hashes");
assert(simulated.autoEnforceNewPolicy === false, "expected new policy changes to avoid auto-enforcement");
assert(simulated.reviewQueue.every((item) => item.status.includes("required")), "expected review-required change queue");
assert(
  simulated.controls.some((control) => control.id === "PSI-003" && control.passed),
  "expected human review before enforcement control",
);
assert(
  simulated.controls.some((control) => control.id === "PSI-006" && control.passed),
  "expected no auto enforcement control",
);

const liveBlocked = await buildPolicyIntelligenceStatus({
  env: {
    SENTINELOPS_POLICY_INTEL_MODE: "live",
  },
});
assert(liveBlocked.status === "review-required", "expected live mode without approvals to require review");
assert(
  liveBlocked.controls.some((control) => control.id === "PSI-004" && !control.passed),
  "expected live source fetching without approval to fail",
);

const liveReady = await buildPolicyIntelligenceStatus({
  env: {
    SENTINELOPS_POLICY_INTEL_MODE: "live",
    SENTINELOPS_POLICY_SOURCE_FETCH_APPROVED: "true",
    SENTINELOPS_POLICY_REVIEW_OWNER: "Customer ISSO",
  },
});
assert(liveReady.status === "live-watch-ready", `expected live-watch-ready, got ${liveReady.status}`);

console.log(
  JSON.stringify(
    {
      simulatedStatus: simulated.status,
      liveBlockedStatus: liveBlocked.status,
      liveReadyStatus: liveReady.status,
      sourceCount: simulated.sources.length,
      reviewQueueCount: simulated.reviewQueue.length,
      activePolicyRules: simulated.counts.activePolicyRules,
      controlsPassing: `${simulated.counts.passingControls}/${simulated.counts.totalControls}`,
      autoEnforceNewPolicy: simulated.autoEnforceNewPolicy,
    },
    null,
    2,
  ),
);
