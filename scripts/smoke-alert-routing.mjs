import { routeObservabilityAlerts, verifyAlertDispatchLedger } from "../server/alert-routing.mjs";
import { applyGateDecision, createAssessmentRun } from "../server/assessment-engine.mjs";
import { buildObservabilitySummary } from "../server/observability.mjs";
import { hasPermission, permissions } from "../server/rbac.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const firstRun = createAssessmentRun(1301);
const first = await applyGateDecision(
  firstRun,
  {
    state: "approved",
    reviewer: "Grant Burley III",
    reviewerRole: "security-reviewer",
    note: "Alert routing smoke approval one.",
  },
  null,
);

const secondRun = createAssessmentRun(1302);
const second = await applyGateDecision(
  secondRun,
  {
    state: "approved",
    reviewer: "Grant Burley III",
    reviewerRole: "security-reviewer",
    note: "Alert routing smoke approval two.",
  },
  first.approvalRecord.signature,
);

const reviewed = {
  id: "agent-review-alert-routing-smoke",
  runId: second.run.id,
  traceId: second.run.traceId,
  reviewedAt: new Date().toISOString(),
  mode: "deterministic-local",
  recommendation: "controlled-pilot",
  toolUseDecision: "allow-scoped-write-tools",
  confidence: 0.88,
  summary: "Synthetic alert routing smoke review.",
  requiredActions: [],
  riskDeltas: [],
  evalFocus: [],
  citations: [
    {
      id: "audit-evidence-standard",
      title: "Audit Evidence Standard",
      path: "knowledge/audit-evidence-standard.md",
      score: 38.23,
      excerpt: "Audit handoff evidence requires signed approvals and event traces.",
      retrieval: {
        algorithm: "local-tfidf-cosine-v1",
        documentCount: 5,
        vocabularySize: 182,
        matchedTerms: ["audit", "evidence", "event", "reviewer"],
      },
    },
  ],
  traceNotes: [],
};

const tamperedApproval = {
  ...second.approvalRecord,
  reviewer: "Tampered Reviewer",
};

const state = {
  sequence: 1302,
  runs: [second.run, first.run],
  approvals: [tamperedApproval, first.approvalRecord],
  policyChecks: [
    { ...second.policyResult, status: "fail", recommendation: "Synthetic policy alert for routing.", runId: second.run.id, traceId: second.run.traceId },
    { ...first.policyResult, runId: first.run.id, traceId: first.run.traceId },
  ],
  agentReviews: [reviewed],
  alertDispatches: [],
  auditEvents: [
    {
      id: "audit-alert-routing-2",
      at: new Date().toISOString(),
      runId: second.run.id,
      event: "Synthetic alert routing audit event two.",
    },
    {
      id: "audit-alert-routing-1",
      at: new Date().toISOString(),
      runId: first.run.id,
      event: "Synthetic alert routing audit event one.",
    },
  ],
};

const summary = buildObservabilitySummary(state, {
  service: "sentinelops-api",
  version: "0.22.0",
  storage: { mode: "local-json" },
  authMode: "local-dev",
  agentMode: "deterministic-local",
  evalReport: {
    generatedAt: new Date().toISOString(),
    mode: "deterministic-local",
    total: 6,
    passed: 5,
    failed: 1,
    results: [],
  },
});

assert(summary.alerts.some((alert) => alert.id === "ledger-integrity-fail"), "expected ledger integrity alert");
assert(summary.alerts.some((alert) => alert.id === "policy-check-fail"), "expected policy alert");
assert(summary.alerts.some((alert) => alert.id === "eval-pack-fail"), "expected eval alert");

const actor = { name: "Grant Burley III", role: "security-reviewer" };
const routed = routeObservabilityAlerts(summary, actor, null);
const ledger = verifyAlertDispatchLedger(routed.dispatches);
const operatorCanRoute = hasPermission({ name: "Operator", role: "operator" }, permissions.routeAlerts);

assert(routed.routes.some((route) => route.id === "siem-ocsf"), "expected SIEM route");
assert(routed.dispatches.length >= 7, "expected dispatches across email, Slack, and SIEM routes");
assert(routed.siemEvents.length >= 3, "expected SIEM event exports");
assert(routed.siemEvents.every((event) => event.class_uid === 600101), "expected OCSF-like class uid");
assert(routed.siemEvents.every((event) => typeof event.event_hash === "string" && event.event_hash.length === 64), "expected SIEM event hashes");
assert(ledger.passed, "expected dispatch ledger to pass verification");
assert(!operatorCanRoute, "expected operator role to lack route_alerts permission");

console.log(
  JSON.stringify(
    {
      version: summary.version,
      alertIds: summary.alerts.map((alert) => alert.id),
      routeCount: routed.routes.length,
      dispatchCount: routed.dispatches.length,
      siemEventCount: routed.siemEvents.length,
      dispatchLedgerPassed: ledger.passed,
      operatorCanRoute,
    },
    null,
    2,
  ),
);
