import { applyGateDecision, createAssessmentRun } from "../server/assessment-engine.mjs";
import { evaluateInfrastructurePolicyAsCode } from "../server/policy-as-code.mjs";
import { evaluateApprovalPolicy } from "../server/policy-engine.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const passingRun = createAssessmentRun(901);
const passingDecision = {
  state: "approved",
  reviewer: "Grant Burley III",
  reviewerRole: "security-reviewer",
  note: "Policy-as-code smoke approval.",
};
const { policyResult: passingRuntime } = await applyGateDecision(passingRun, passingDecision, null);
assert(passingRuntime.status === "pass", `expected passing runtime policy to pass, received ${passingRuntime.status}`);
assert(
  passingRuntime.checks.some((check) => check.id === "pac-hitl-001" && check.passed),
  "expected HITL policy-as-code check to pass",
);
assert(
  passingRuntime.checks.some((check) => check.id === "pac-gate-004" && check.passed),
  "expected persisted gate-state policy-as-code check to pass",
);

const failingRun = createAssessmentRun(902);
failingRun.approvalGate.state = "approved";
failingRun.approvalGate.requiredEvidence = failingRun.approvalGate.requiredEvidence.filter((item) => item !== "Rollback playbook");
const failingRuntime = await evaluateApprovalPolicy(failingRun, {
  state: "approved",
  reviewer: "",
  reviewerRole: "security-reviewer",
});
assert(failingRuntime.status === "fail", "expected incomplete runtime policy to fail");
assert(
  failingRuntime.checks.some((check) => check.id === "pac-hitl-001" && !check.passed),
  "expected empty reviewer identity to fail HITL policy-as-code",
);
assert(
  failingRuntime.checks.some((check) => check.id === "pac-evid-003" && !check.passed),
  "expected missing rollback evidence to fail evidence policy-as-code",
);

const infrastructure = await evaluateInfrastructurePolicyAsCode();
assert(infrastructure.status === "pass", `expected infrastructure policy to pass, received ${infrastructure.status}`);
assert(infrastructure.checks.length >= 5, "expected infrastructure policy bundle to include at least five checks");
assert(
  infrastructure.checks.some((check) => check.id === "pac-infra-001" && check.passed),
  "expected private ECS networking policy to pass",
);
assert(
  infrastructure.checks.some((check) => check.id === "pac-infra-004" && check.passed),
  "expected encrypted evidence and approval ledger policy to pass",
);

console.log(
  JSON.stringify(
    {
      passingRuntimeStatus: passingRuntime.status,
      passingRuntimeCheckCount: passingRuntime.checks.length,
      failingRuntimeStatus: failingRuntime.status,
      failingRuntimeFailedChecks: failingRuntime.checks.filter((check) => !check.passed).map((check) => check.id),
      infrastructureStatus: infrastructure.status,
      infrastructureCheckCount: infrastructure.checks.length,
    },
    null,
    2,
  ),
);
