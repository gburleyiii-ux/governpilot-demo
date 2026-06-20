import { readFile } from "node:fs/promises";
import { evaluateRuntimePolicyAsCode } from "./policy-as-code.mjs";

const policyUrl = new URL("./policies/agent-action-policy.json", import.meta.url);

export async function loadPolicy() {
  const raw = await readFile(policyUrl, "utf8");
  return JSON.parse(raw);
}

export async function evaluateApprovalPolicy(run, decision) {
  const policy = await loadPolicy();
  const policyAsCodeResult = await evaluateRuntimePolicyAsCode(run, decision);
  const gateEvidence = new Set(run.approvalGate.requiredEvidence);
  const requiredEvidence = policy.requiredEvidence.map((label) => ({
    id: `evidence-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`,
    label,
    passed: gateEvidence.has(label),
  }));
  const hasCriticalToolRisk = run.risks.some((risk) => risk.id === "risk-tool" && risk.severity === "critical");
  const checks = [
    ...requiredEvidence,
    {
      id: "hitl-reviewer-present",
      label: "Reviewer identity attached to approval decision",
      passed: Boolean(decision.reviewer && decision.reviewer.trim()),
    },
    {
      id: "trace-linked-decision",
      label: "Approval decision links to active trace ID",
      passed: Boolean(run.traceId && run.approvalGate.id),
    },
    {
      id: "critical-risk-gated",
      label: "Critical unsafe-tool risk cannot bypass gate",
      passed: !hasCriticalToolRisk || decision.state !== "approved" || run.approvalGate.state !== "pending",
    },
    ...policyAsCodeResult.checks,
  ];
  const status = checks.every((check) => check.passed) ? "pass" : "fail";
  return {
    id: `policy-${Date.now().toString(36)}`,
    policyId: policy.id,
    policyName: policy.name,
    framework: policy.framework,
    status,
    recommendation:
      status === "pass"
        ? "Proceed with controlled pilot boundary."
        : "Keep external action group blocked until failing checks are remediated.",
    checkedAt: new Date().toISOString(),
    checks,
  };
}
