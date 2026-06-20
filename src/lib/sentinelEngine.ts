import { seedRun } from "../data/seed";
import type { AssessmentRun, GateState } from "./types";

export function createAssessmentRun(sequence = 1): AssessmentRun {
  const cloned = structuredClone(seedRun);
  const suffix = String(sequence).padStart(2, "0");
  cloned.id = `run-0426-${suffix}`;
  cloned.traceId = `trace_fedai_9b72_${suffix}`;
  cloned.startedAt = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  cloned.events = [
    `Assessment ${suffix} opened from SentinelOps template.`,
    ...cloned.events,
  ];
  return cloned;
}

export function decideGate(run: AssessmentRun, state: GateState): AssessmentRun {
  const updated = structuredClone(run);
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

  updated.events = [
    `${state === "approved" ? "Approved" : "Denied"}: ${updated.approvalGate.title}.`,
    ...updated.events,
  ];
  return updated;
}

export function rerunEvalPack(run: AssessmentRun): AssessmentRun {
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

export function buildEvidencePacket(run: AssessmentRun): string {
  const riskRows = run.risks
    .map((risk) => `- ${risk.function}: ${risk.label} | ${risk.status} | score ${risk.score}`)
    .join("\n");
  const evalRows = run.evals
    .map((metric) => `- ${metric.label}: ${metric.score}/100 (${metric.status})`)
    .join("\n");

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
    "## Latest Events",
    ...run.events.slice(0, 8).map((event) => `- ${event}`),
  ].join("\n");
}
