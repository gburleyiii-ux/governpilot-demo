import { readFile } from "node:fs/promises";
import { z } from "zod";
import { retrievePolicyContext } from "./retrieval.mjs";

const policyUrl = new URL("../server/policies/agent-action-policy.json", import.meta.url);

export function getAgentRuntimeMode() {
  if (process.env.SENTINELOPS_AGENT_MODE === "live" && process.env.OPENAI_API_KEY) {
    return "openai-agents-sdk";
  }
  if (process.env.SENTINELOPS_AGENT_MODE === "live") {
    return "credential-required";
  }
  return "deterministic-local";
}

async function loadPolicy() {
  const raw = await readFile(policyUrl, "utf8");
  return JSON.parse(raw);
}

function deterministicReview(run, policy, citations) {
  const requiredEvidence = new Set(run.approvalGate.requiredEvidence);
  const missingEvidence = policy.requiredEvidence.filter((label) => !requiredEvidence.has(label));
  const criticalToolRisk = run.risks.find((risk) => risk.id === "risk-tool" && risk.severity === "critical");
  const promptRisk = run.risks.find((risk) => risk.id === "risk-prompt");
  const piiRisk = run.risks.find((risk) => risk.id === "risk-pii");
  const gateState = run.approvalGate.state;
  const hallucinationEval = run.evals.find((metric) => metric.id === "eval-hallucination");
  const policyCompliance = run.evals.find((metric) => metric.id === "eval-policy");
  const toolSafety = run.evals.find((metric) => metric.id === "eval-tools");
  const hasApproval = gateState === "approved";
  const denied = gateState === "denied";
  const promptInjectionBlock =
    promptRisk?.severity === "critical" ||
    promptRisk?.status.toLowerCase().includes("blocked") ||
    hallucinationEval?.status === "fail";
  const retrievalDriftBlock = policyCompliance?.status === "fail" || piiRisk?.status.toLowerCase().includes("drift");
  const canProceed =
    hasApproval && missingEvidence.length === 0 && toolSafety?.status === "pass" && !promptInjectionBlock && !retrievalDriftBlock;

  return {
    mode: "deterministic-local",
    recommendation: canProceed ? "controlled-pilot" : "block",
    toolUseDecision: canProceed ? "allow-scoped-write-tools" : promptInjectionBlock || retrievalDriftBlock ? "policy-blocked" : "approval-required",
    confidence: canProceed ? 0.88 : 0.81,
    summary: canProceed
      ? "Controlled pilot can proceed because reviewer approval, policy evidence, audit trail, and tool-safety evals are present."
      : promptInjectionBlock
        ? "Deployment remains blocked because adversarial prompt-injection evals indicate unsafe instruction-following risk."
      : retrievalDriftBlock
        ? "Deployment remains blocked because retrieval-policy drift could bypass the approved governance memory."
      : denied
        ? "External action group remains denied; deployment cannot proceed until a new reviewer decision reopens the gate."
      : "Deployment remains blocked until reviewer approval, required evidence, and tool-safety eval criteria are satisfied.",
    requiredActions: [
      ...(hasApproval || denied ? [] : ["Record human reviewer approval for write-capable external action group."]),
      ...(denied ? ["Keep denied external action group disabled unless a new review is opened."] : []),
      ...missingEvidence.map((label) => `Attach evidence: ${label}.`),
      ...(promptInjectionBlock ? ["Mitigate prompt-injection failures and rerun adversarial red-team evals."] : []),
      ...(retrievalDriftBlock ? ["Refresh retrieval allowlist and rerun retrieval-policy drift evals."] : []),
      ...(toolSafety?.status === "pass" ? [] : ["Rerun eval pack until tool-safety regression cases pass."]),
      ...(criticalToolRisk ? ["Keep external action group scoped to controlled-pilot boundary."] : []),
    ],
    riskDeltas: [
      {
        riskId: "risk-tool",
        from: criticalToolRisk?.score ?? null,
        to: canProceed ? 48 : criticalToolRisk?.score ?? 91,
        rationale: "Tool risk score depends on signed approval, egress scope, rollback evidence, and tool-safety eval status.",
      },
      ...(promptRisk
        ? [
            {
              riskId: "risk-prompt",
              from: promptRisk.score,
              to: promptInjectionBlock ? Math.max(promptRisk.score, 94) : Math.max(promptRisk.score - 8, 0),
              rationale: "Prompt-injection score depends on adversarial refusal behavior and instruction hierarchy preservation.",
            },
          ]
        : []),
      ...(piiRisk
        ? [
            {
              riskId: "risk-pii",
              from: piiRisk.score,
              to: retrievalDriftBlock ? Math.max(piiRisk.score, 90) : Math.max(piiRisk.score - 6, 0),
              rationale: "PII and retrieval risk depends on approved source allowlists, stale-policy drift checks, and citation grounding.",
            },
          ]
        : []),
    ],
    evalFocus: [
      "approval-before-write",
      "missing-evidence-block",
      "egress-scope-check",
      "rollback-proof-check",
      "prompt-injection-resistance",
      "retrieval-policy-drift",
    ],
    citations,
    traceNotes: [
      `Run ${run.id} reviewed in ${getAgentRuntimeMode()} mode.`,
      `Gate state: ${gateState}.`,
      `Missing evidence count: ${missingEvidence.length}.`,
    ],
  };
}

async function sdkReview(run, policy, citations) {
  const { Agent, run: runAgent, tool } = await import("@openai/agents");

  const policyTool = tool({
    name: "load_sentinelops_policy",
    description: "Return the active SentinelOps AI external action group policy.",
    parameters: z.object({}),
    execute: async () => policy,
  });

  const approvalTool = tool({
    name: "request_external_action_approval",
    description: "Request approval before enabling write-capable external action groups.",
    parameters: z.object({
      gateId: z.string(),
      reason: z.string(),
    }),
    needsApproval: async () => true,
    execute: async ({ gateId, reason }) => ({
      gateId,
      reason,
      status: "approval-required",
    }),
  });

  const agent = new Agent({
    name: "SentinelOps Deployment Reviewer",
    instructions: [
      "You review agentic AI deployments for regulated enterprise environments.",
      "Map risks to NIST AI RMF style functions and keep write-capable tools blocked until human approval is present.",
      "Return concise JSON with recommendation, toolUseDecision, summary, requiredActions, evalFocus, and traceNotes.",
      "Never claim evidence is present unless it is listed in the run payload.",
    ].join(" "),
    tools: [policyTool, approvalTool],
  });

  const result = await runAgent(
    agent,
    JSON.stringify({
      task: "Review this SentinelOps AI deployment run and recommend whether it can proceed.",
      run,
      policy,
      citations,
    }),
  );

  return {
    mode: "openai-agents-sdk",
    recommendation: "review-output",
    toolUseDecision: "see-final-output",
    confidence: null,
    summary: typeof result.finalOutput === "string" ? result.finalOutput : JSON.stringify(result.finalOutput),
    requiredActions: [],
    riskDeltas: [],
    evalFocus: [],
    citations,
    traceNotes: [`Run ${run.id} completed through OpenAI Agents SDK.`],
  };
}

export async function runDeploymentReview(run) {
  const policy = await loadPolicy();
  const mode = getAgentRuntimeMode();
  const citations = await retrievePolicyContext(
    [
      run.approvalGate.title,
      run.approvalGate.reason,
      run.approvalGate.requiredEvidence.join(" "),
      run.risks.map((risk) => `${risk.label} ${risk.evidence}`).join(" "),
      run.evals.map((metric) => `${metric.label} ${metric.detail}`).join(" "),
    ].join(" "),
  );

  if (mode === "openai-agents-sdk") {
    return sdkReview(run, policy, citations);
  }

  if (mode === "credential-required") {
    return {
      ...deterministicReview(run, policy, citations),
      mode,
      summary:
        "Live agent mode was requested, but OPENAI_API_KEY is not configured. Deterministic reviewer output was returned instead.",
      traceNotes: [`Run ${run.id} skipped live SDK execution because credentials are missing.`],
    };
  }

  return deterministicReview(run, policy, citations);
}
