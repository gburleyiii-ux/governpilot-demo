import { buildCostGuardrails } from "../server/cost-guardrails.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const localGuardrails = buildCostGuardrails({
  version: "0.22.0",
  authMode: "local-dev",
  agentMode: "deterministic-local",
  storage: { mode: "local-json" },
  env: {},
});

assert(localGuardrails.status === "guarded", "expected guarded status in local deterministic mode");
assert(localGuardrails.routeBudgets.length === 3, "expected route budgets for all gateway routes");
assert(localGuardrails.preferredRouteBudget.routeId === "deterministic-local", "expected local preferred route budget");
assert(localGuardrails.preferredRouteBudget.estimatedCostUsd === 0, "expected local route to have zero external spend");
assert(localGuardrails.counts.passingControls === localGuardrails.counts.totalControls, "expected local controls to pass");
assert(localGuardrails.controls.some((control) => control.id === "CBG-006" && control.passed), "expected disclosure control");
assert(!JSON.stringify(localGuardrails).includes("sk-test-secret"), "expected no raw secret disclosure");

const liveWithoutBudgetApproval = buildCostGuardrails({
  version: "0.22.0",
  authMode: "jwt",
  agentMode: "live",
  storage: { mode: "aws-s3-dynamodb" },
  env: {
    OPENAI_API_KEY: "sk-test-secret",
    SENTINELOPS_AGENT_MODE: "live",
  },
});

assert(liveWithoutBudgetApproval.status === "review-required", "expected live mode to require budget approval");
assert(
  liveWithoutBudgetApproval.controls.some((control) => control.id === "CBG-005" && !control.passed),
  "expected live budget approval control to fail",
);
assert(!JSON.stringify(liveWithoutBudgetApproval).includes("sk-test-secret"), "expected OpenAI secret redaction");

const overBudget = buildCostGuardrails({
  version: "0.22.0",
  authMode: "oidc",
  agentMode: "live",
  storage: { mode: "aws-s3-dynamodb" },
  env: {
    OPENAI_API_KEY: "sk-test-secret",
    SENTINELOPS_AGENT_MODE: "live",
    SENTINELOPS_LIVE_BUDGET_APPROVED: "true",
    SENTINELOPS_RUN_BUDGET_USD: "0.001",
  },
});

assert(overBudget.status === "review-required", "expected over-budget route to require review");
assert(overBudget.counts.routesOverBudget >= 1, "expected route over budget count");
assert(
  overBudget.routeBudgets.some((route) => route.routeId === "openai-agents-sdk" && route.costStatus === "review-required"),
  "expected OpenAI route to exceed tight budget",
);

console.log(
  JSON.stringify(
    {
      localStatus: localGuardrails.status,
      guardrailVersion: localGuardrails.guardrailVersion,
      routeCount: localGuardrails.routeBudgets.length,
      controlCount: localGuardrails.counts.totalControls,
      localPreferredRoute: localGuardrails.preferredRouteId,
      liveBudgetGate: liveWithoutBudgetApproval.controls.find((control) => control.id === "CBG-005").passed,
      overBudgetRoutes: overBudget.counts.routesOverBudget,
      noSecretDisclosure: !JSON.stringify(liveWithoutBudgetApproval).includes("sk-test-secret"),
    },
    null,
    2,
  ),
);
