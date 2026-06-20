import { applyGateDecision, createAssessmentRun } from "../server/assessment-engine.mjs";
import { buildObservabilitySummary } from "../server/observability.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const firstRun = createAssessmentRun(1201);
const first = await applyGateDecision(
  firstRun,
  {
    state: "approved",
    reviewer: "Grant Burley III",
    reviewerRole: "security-reviewer",
    note: "Observability smoke approval one.",
  },
  null,
);

const secondRun = createAssessmentRun(1202);
const second = await applyGateDecision(
  secondRun,
  {
    state: "approved",
    reviewer: "Grant Burley III",
    reviewerRole: "security-reviewer",
    note: "Observability smoke approval two.",
  },
  first.approvalRecord.signature,
);

const agentReview = {
  id: "agent-review-observability-smoke",
  runId: second.run.id,
  traceId: second.run.traceId,
  reviewedAt: new Date().toISOString(),
  mode: "deterministic-local",
  recommendation: "controlled-pilot",
  toolUseDecision: "allow-scoped-write-tools",
  confidence: 0.88,
  summary: "Synthetic observability smoke review.",
  requiredActions: [],
  riskDeltas: [],
  evalFocus: [],
  citations: [
    {
      id: "tool-approval-standard",
      title: "Tool Approval Standard",
      path: "knowledge/tool-approval-standard.md",
      score: 51.68,
      excerpt: "Scoped service account, egress allowlist, rollback, and audit retention evidence.",
      retrieval: {
        algorithm: "local-tfidf-cosine-v1",
        documentCount: 5,
        vocabularySize: 182,
        matchedTerms: ["approval", "audit", "egress", "rollback"],
      },
    },
  ],
  traceNotes: [],
};

const healthyState = {
  sequence: 1202,
  runs: [second.run, first.run],
  approvals: [second.approvalRecord, first.approvalRecord],
  policyChecks: [
    { ...second.policyResult, runId: second.run.id, traceId: second.run.traceId },
    { ...first.policyResult, runId: first.run.id, traceId: first.run.traceId },
  ],
  agentReviews: [agentReview],
  auditEvents: [
    {
      id: "audit-observability-2",
      at: new Date().toISOString(),
      runId: second.run.id,
      event: "Synthetic observability audit event two.",
    },
    {
      id: "audit-observability-1",
      at: new Date().toISOString(),
      runId: first.run.id,
      event: "Synthetic observability audit event one.",
    },
  ],
};

const evalReport = {
  generatedAt: new Date().toISOString(),
  mode: "deterministic-local",
  total: 6,
  passed: 6,
  failed: 0,
  results: [],
};

const healthy = buildObservabilitySummary(healthyState, {
  service: "sentinelops-api",
  version: "0.22.0",
  storage: { mode: "local-json" },
  authMode: "local-dev",
  agentMode: "deterministic-local",
  evalReport,
});

assert(healthy.version === "0.22.0", "expected version in observability summary");
assert(healthy.counts.runs === 2, "expected run count in observability summary");
assert(healthy.signals.approvalLedger.passed, "expected healthy ledger signal");
assert(healthy.slos.every((slo) => slo.status === "pass"), "expected all healthy SLOs to pass");
assert(healthy.alerts.some((alert) => alert.id === "monitoring-clear"), "expected clear monitoring alert");
assert(healthy.signals.retrieval.algorithms.includes("local-tfidf-cosine-v1"), "expected retrieval algorithm signal");

const brokenState = structuredClone(healthyState);
brokenState.approvals[0].reviewer = "Tampered Reviewer";
const broken = buildObservabilitySummary(brokenState, {
  evalReport: { ...evalReport, passed: 5, failed: 1 },
});

assert(!broken.signals.approvalLedger.passed, "expected tampered ledger signal to fail");
assert(broken.slos.some((slo) => slo.id === "ledger-integrity" && slo.status === "fail"), "expected ledger SLO failure");
assert(broken.slos.some((slo) => slo.id === "eval-pass-rate" && slo.status === "fail"), "expected eval SLO failure");
assert(broken.alerts.some((alert) => alert.id === "ledger-integrity-fail"), "expected ledger alert");
assert(broken.alerts.some((alert) => alert.id === "eval-pack-fail"), "expected eval alert");

console.log(
  JSON.stringify(
    {
      service: healthy.service,
      version: healthy.version,
      sloCount: healthy.slos.length,
      healthyAlerts: healthy.alerts.map((alert) => alert.id),
      brokenAlerts: broken.alerts.map((alert) => alert.id),
      retrievalAlgorithms: healthy.signals.retrieval.algorithms,
    },
    null,
    2,
  ),
);
