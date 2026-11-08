import { readFile } from "node:fs/promises";
import { evaluateRuntimePolicyAsCode } from "./policy-as-code.mjs";

const policyUrl = new URL("./policies/agent-action-policy.json", import.meta.url);

export async function loadPolicy() {
  const raw = await readFile(policyUrl, "utf8");
  return JSON.parse(raw);
}

function timeoutMsFrom(options = {}) {
  if (options.timeoutMs !== undefined) return Number(options.timeoutMs);
  if (process.env.SENTINELOPS_POLICY_TIMEOUT_MS) return Number(process.env.SENTINELOPS_POLICY_TIMEOUT_MS);
  return 5000;
}

// Fail closed when policy evaluation does not finish. A non-positive deadline
// is itself a failure, not an unlimited wait.
export async function withPolicyDeadline(work, timeoutMs) {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms < 1) {
    throw Object.assign(new Error("Policy check timeout must be a positive number of milliseconds."), {
      code: "POLICY_TIMEOUT",
      statusCode: 422,
    });
  }
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error(`Policy check timed out after ${ms}ms.`), {
            code: "POLICY_TIMEOUT",
            statusCode: 422,
          }));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function evaluateApprovalPolicyUnbounded(run, decision, options = {}) {
  if (options.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, options.delayMs));
  }
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

export async function evaluateApprovalPolicy(run, decision, options = {}) {
  return withPolicyDeadline(() => evaluateApprovalPolicyUnbounded(run, decision, options), timeoutMsFrom(options));
}
