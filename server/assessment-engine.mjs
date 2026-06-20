import { createHmac } from "node:crypto";
import { evaluateApprovalPolicy } from "./policy-engine.mjs";
import { cloneSeedRun } from "./seed.mjs";
import { resolveSigningSecret, signatureModeFor } from "./signing-guard.mjs";

function nowTime() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function nextId(prefix) {
  return `${prefix}-${Date.now().toString(36)}`;
}

function signRecord(payload, previousHash) {
  const secret = resolveSigningSecret();
  const signaturePayload = JSON.stringify({ payload, previousHash });
  return createHmac("sha256", secret).update(signaturePayload).digest("hex");
}

export function createAssessmentRun(sequence = 1) {
  const cloned = cloneSeedRun();
  const suffix = String(sequence).padStart(2, "0");
  cloned.id = `run-0426-${suffix}`;
  cloned.traceId = `trace_fedai_9b72_${suffix}`;
  cloned.startedAt = nowTime();
  cloned.events = [`Assessment ${suffix} opened from SentinelOps API service.`, ...cloned.events];
  return cloned;
}

export async function applyGateDecision(run, decision, previousApprovalHash) {
  const updated = structuredClone(run);
  const state = decision.state;
  updated.approvalGate.state = state;
  updated.approvalState = state === "approved" ? "Approved for controlled pilot" : "Action group denied";

  updated.agents = updated.agents.map((agent) => {
    if (agent.id === "evidence") {
      return {
        ...agent,
        status: state === "approved" ? "running" : "blocked",
        traceId: state === "approved" ? "trc-evd-live" : "trc-evd-blocked",
        output:
          state === "approved"
            ? "Building signed evidence packet with reviewer approval attached."
            : "Go/no-go memo blocked because external action group was denied.",
      };
    }
    if (agent.id === "cost" && agent.status === "running") {
      return {
        ...agent,
        status: "complete",
        output: "Projected operating cost remains inside policy budget with model fallback capped.",
      };
    }
    return agent;
  });

  updated.risks = updated.risks.map((risk) =>
    risk.id === "risk-tool"
      ? {
          ...risk,
          score: state === "approved" ? 52 : 88,
          status: state === "approved" ? "Controlled pilot" : "Denied",
          evidence:
            state === "approved"
              ? "Reviewer approved scoped action group with egress allowlist and rollback playbook."
              : "External write-capable action was denied and remains blocked.",
        }
      : risk,
  );

  updated.evidence = updated.evidence.map((item) =>
    item.id === "evidence-go"
      ? {
          ...item,
          state: state === "approved" ? "needs-review" : "blocked",
        }
      : item,
  );

  const policyResult = await evaluateApprovalPolicy(updated, decision);
  const approvalRecord = {
    id: nextId("approval"),
    runId: updated.id,
    gateId: updated.approvalGate.id,
    traceId: updated.traceId,
    state,
    reviewer: decision.reviewer,
    reviewerRole: decision.reviewerRole || "security-reviewer",
    note: decision.note || "",
    decidedAt: new Date().toISOString(),
    policyStatus: policyResult.status,
    previousHash: previousApprovalHash || null,
    signatureMode: signatureModeFor(),
  };
  approvalRecord.signature = signRecord(approvalRecord, previousApprovalHash || null);

  updated.events = [
    `${state === "approved" ? "Approved" : "Denied"}: ${updated.approvalGate.title} by ${decision.reviewer} as ${
      decision.reviewerRole || "security-reviewer"
    }.`,
    `Policy ${policyResult.status}: ${policyResult.recommendation}`,
    ...updated.events,
  ];

  return { run: updated, approvalRecord, policyResult };
}

export function rerunEvalPack(run) {
  const updated = structuredClone(run);
  updated.evals = updated.evals.map((metric) => {
    if (metric.id === "eval-tools") {
      return {
        ...metric,
        score: Math.min(100, metric.score + 9),
        trend: "+9",
        status: "pass",
        detail: "Tool invocation tests now enforce approval-before-write.",
      };
    }
    if (metric.id === "eval-cost") {
      return {
        ...metric,
        score: Math.min(100, metric.score + 5),
        trend: "+5",
        detail: "Fallback budget cap applied.",
      };
    }
    return {
      ...metric,
      score: Math.min(100, metric.score + 1),
      trend: "+1",
    };
  });
  updated.events = ["Eval pack rerun with approval-gate regression cases.", ...updated.events];
  return updated;
}

export function buildEvidencePacket(run, approvals = [], policyChecks = [], agentReviews = []) {
  const riskRows = run.risks
    .map((risk) => `- ${risk.function}: ${risk.label} | ${risk.status} | score ${risk.score}`)
    .join("\n");
  const evalRows = run.evals.map((metric) => `- ${metric.label}: ${metric.score}/100 (${metric.status})`).join("\n");
  const approvalRows = approvals.length
    ? approvals
        .map(
          (approval) =>
            `- ${approval.state} by ${approval.reviewer} (${approval.reviewerRole || "security-reviewer"}) at ${
              approval.decidedAt
            } | signature ${approval.signature.slice(0, 16)}`,
        )
        .join("\n")
    : "- No reviewer decision recorded yet.";
  const policyRows = policyChecks.length
    ? policyChecks.map((check) => `- ${check.policyName}: ${check.status} | ${check.recommendation}`).join("\n")
    : "- No policy check recorded yet.";
  const agentRows = agentReviews.length
    ? agentReviews
        .map((review) => `- ${review.mode}: ${review.recommendation} | ${review.summary}`)
        .join("\n")
    : "- No agent review recorded yet.";
  const citationRows = agentReviews.flatMap((review) => review.citations || []).length
    ? agentReviews
        .flatMap((review) => review.citations || [])
        .map((citation) => `- ${citation.title} (${citation.path})`)
        .join("\n")
    : "- No retrieved policy citations recorded yet.";

  return [
    `# ${run.title}`,
    "",
    `Run: ${run.id}`,
    `Trace: ${run.traceId}`,
    `Environment: ${run.environment}`,
    `Cloud target: ${run.cloudTarget}`,
    `Approval state: ${run.approvalState}`,
    "",
    "## Risk Matrix",
    riskRows,
    "",
    "## Eval Health",
    evalRows,
    "",
    "## Approval Signatures",
    approvalRows,
    "",
    "## Policy Checks",
    policyRows,
    "",
    "## Agent Review",
    agentRows,
    "",
    "## Retrieved Policy Citations",
    citationRows,
    "",
    "## Latest Events",
    ...run.events.slice(0, 10).map((event) => `- ${event}`),
  ].join("\n");
}
