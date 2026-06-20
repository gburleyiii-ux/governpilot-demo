import { verifyApprovalLedger } from "./audit-integrity.mjs";

function percent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function statusFromPassed(passed) {
  return passed ? "pass" : "fail";
}

function latestForRun(items, runId) {
  return items.find((item) => item.runId === runId) || null;
}

function buildSlo(id, label, actual, target, passed, detail) {
  return {
    id,
    label,
    actual,
    target,
    status: statusFromPassed(passed),
    detail,
  };
}

function buildAlerts({ ledger, latestPolicyCheck, evalReport, latestRun, latestAgentReview, runApproval, auditEvents }) {
  const alerts = [];
  if (!ledger.passed) {
    alerts.push({
      id: "ledger-integrity-fail",
      severity: "critical",
      title: "Approval ledger integrity failed",
      detail: "One or more approval signatures or previous-hash links failed verification.",
    });
  }
  if (latestPolicyCheck?.status === "fail") {
    alerts.push({
      id: "policy-check-fail",
      severity: "high",
      title: "Latest policy check failed",
      detail: latestPolicyCheck.recommendation,
    });
  }
  if (evalReport && evalReport.failed > 0) {
    alerts.push({
      id: "eval-pack-fail",
      severity: "high",
      title: "Eval pack has failing cases",
      detail: `${evalReport.failed}/${evalReport.total} eval cases are failing.`,
    });
  }
  if (latestRun?.approvalGate.state === "approved" && !latestAgentReview) {
    alerts.push({
      id: "agent-review-missing",
      severity: "medium",
      title: "Approved run is missing agent review",
      detail: "Run the deployment reviewer before exporting evidence.",
    });
  }
  if (latestRun?.approvalGate.state === "approved" && !runApproval) {
    alerts.push({
      id: "approval-record-missing",
      severity: "critical",
      title: "Approved gate has no approval record",
      detail: "The run state is approved but no signed approval record is attached.",
    });
  }
  if (auditEvents.length === 0) {
    alerts.push({
      id: "audit-events-empty",
      severity: "medium",
      title: "No audit events recorded",
      detail: "State changes should leave audit events for reviewer handoff.",
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      id: "monitoring-clear",
      severity: "info",
      title: "No active SentinelOps alerts",
      detail: "Current ledger, policy, eval, retrieval, and audit signals are within target.",
    });
  }
  return alerts;
}

export function buildObservabilitySummary(state, context = {}) {
  const alertDispatches = state.alertDispatches || [];
  const latestRun = state.runs[0] || null;
  const latestRunId = latestRun?.id || null;
  const runApprovals = latestRunId ? state.approvals.filter((approval) => approval.runId === latestRunId) : [];
  const latestPolicyCheck = latestRunId ? latestForRun(state.policyChecks, latestRunId) : null;
  const latestAgentReview = latestRunId ? latestForRun(state.agentReviews, latestRunId) : null;
  const latestRunAuditEvents = latestRunId ? state.auditEvents.filter((event) => event.runId === latestRunId) : [];
  const ledger = verifyApprovalLedger(state.approvals);
  const evalReport = context.evalReport || null;
  const evalPassRate = evalReport?.total ? percent(evalReport.passed, evalReport.total) : percent(latestRun?.evals?.filter((metric) => metric.status === "pass").length || 0, latestRun?.evals?.length || 0);
  const policyPassRate = percent(state.policyChecks.filter((check) => check.status === "pass").length, state.policyChecks.length);
  const latestReviewCitations = latestAgentReview?.citations || [];
  const retrievalMetadataCount = latestReviewCitations.filter((citation) => citation.retrieval?.algorithm).length;
  const retrievalCoverage = percent(retrievalMetadataCount, latestReviewCitations.length);
  const ledgerIntegrity = percent(Math.min(ledger.validSignatures, ledger.validChainLinks), ledger.total);
  const auditCompletenessChecks = [
    runApprovals.length > 0,
    Boolean(latestPolicyCheck),
    Boolean(latestAgentReview),
    latestRunAuditEvents.length > 0,
  ];
  const auditCompleteness = percent(auditCompletenessChecks.filter(Boolean).length, auditCompletenessChecks.length);

  const slos = [
    buildSlo(
      "ledger-integrity",
      "Approval ledger integrity",
      `${ledgerIntegrity}%`,
      "100%",
      ledger.passed,
      `${ledger.validSignatures}/${ledger.total} signatures and ${ledger.validChainLinks}/${ledger.total} chain links verified.`,
    ),
    buildSlo(
      "eval-pass-rate",
      "Eval pass rate",
      `${evalPassRate}%`,
      "100%",
      evalPassRate === 100,
      evalReport ? `${evalReport.passed}/${evalReport.total} eval cases passed.` : "Latest run eval metrics used because no eval report is present.",
    ),
    buildSlo(
      "policy-pass-rate",
      "Policy pass rate",
      `${policyPassRate}%`,
      "100%",
      state.policyChecks.length === 0 || policyPassRate === 100,
      `${state.policyChecks.filter((check) => check.status === "pass").length}/${state.policyChecks.length} policy checks passed.`,
    ),
    buildSlo(
      "retrieval-citation-coverage",
      "Retrieval citation coverage",
      `${retrievalCoverage}%`,
      "100%",
      latestReviewCitations.length > 0 && retrievalCoverage === 100,
      `${retrievalMetadataCount}/${latestReviewCitations.length} latest citations include retrieval metadata.`,
    ),
    buildSlo(
      "audit-completeness",
      "Latest run audit completeness",
      `${auditCompleteness}%`,
      "100%",
      auditCompleteness === 100,
      "Requires approval, policy check, agent review, and audit event for the latest run.",
    ),
  ];

  const alerts = buildAlerts({
    ledger,
    latestPolicyCheck,
    evalReport,
    latestRun,
    latestAgentReview,
    runApproval: runApprovals[0] || null,
    auditEvents: latestRunAuditEvents,
  });

  return {
    generatedAt: new Date().toISOString(),
    service: context.service || "sentinelops-api",
    version: context.version || "unknown",
    agentMode: context.agentMode || "deterministic-local",
    storageMode: context.storage?.mode || context.storageMode || "local-json",
    authMode: context.authMode || "local-dev",
    latestRunId,
    counts: {
      runs: state.runs.length,
      approvals: state.approvals.length,
      policyChecks: state.policyChecks.length,
      agentReviews: state.agentReviews.length,
      alertDispatches: alertDispatches.length,
      auditEvents: state.auditEvents.length,
    },
    slos,
    alerts,
    signals: {
      approvalLedger: {
        passed: ledger.passed,
        total: ledger.total,
        validSignatures: ledger.validSignatures,
        validChainLinks: ledger.validChainLinks,
      },
      latestPolicyCheck: latestPolicyCheck
        ? {
            status: latestPolicyCheck.status,
            passedChecks: latestPolicyCheck.checks.filter((check) => check.passed).length,
            totalChecks: latestPolicyCheck.checks.length,
          }
        : null,
      evalReport: evalReport
        ? {
            generatedAt: evalReport.generatedAt,
            total: evalReport.total,
            passed: evalReport.passed,
            failed: evalReport.failed,
          }
        : null,
      retrieval: {
        latestCitationCount: latestReviewCitations.length,
        citationMetadataCount: retrievalMetadataCount,
        algorithms: [...new Set(latestReviewCitations.map((citation) => citation.retrieval?.algorithm).filter(Boolean))],
      },
    },
    recentEvents: state.auditEvents.slice(0, 6),
  };
}
