import { buildRegoCompatibility } from "../server/rego-compat.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const compatibility = await buildRegoCompatibility();

assert(compatibility.status === "compatible", `expected compatible status, received ${compatibility.status}`);
assert(compatibility.compatibilityVersion === "sentinelops-opa-rego-compat/v1", "expected compatibility version");
assert(compatibility.modules.length === 2, "expected runtime and infrastructure modules");
assert(compatibility.modules.some((module) => module.packageName === "sentinelops.runtime"), "expected runtime package");
assert(
  compatibility.modules.some((module) => module.packageName === "sentinelops.infrastructure"),
  "expected infrastructure package",
);
assert(compatibility.supportedOperators.includes("containsAll"), "expected containsAll operator mapping");
assert(compatibility.counts.unsupportedConditions === 0, "expected all current conditions to be supported");
assert(compatibility.counts.runtimeRules >= 4, "expected runtime rules to be exported");
assert(compatibility.counts.infrastructureRules >= 5, "expected infrastructure rules to be exported");

const runtimeModule = compatibility.modules.find((module) => module.domain === "runtime");
const infraModule = compatibility.modules.find((module) => module.domain === "infrastructure");
assert(runtimeModule.rego.includes("package sentinelops.runtime"), "expected runtime Rego package");
assert(runtimeModule.rego.includes("PAC-HITL-001"), "expected HITL rule in runtime Rego");
assert(runtimeModule.rego.includes("sentinelops_includes_all"), "expected helper mapping in runtime Rego");
assert(infraModule.rego.includes("package sentinelops.infrastructure"), "expected infrastructure Rego package");
assert(infraModule.rego.includes("assign_public_ip = false"), "expected Terraform condition in infrastructure Rego");
assert(compatibility.usage.command.includes("opa eval"), "expected OPA eval usage guidance");

console.log(
  JSON.stringify(
    {
      status: compatibility.status,
      packageRoot: compatibility.packageRoot,
      moduleCount: compatibility.modules.length,
      ruleCount: compatibility.counts.rules,
      runtimeRules: compatibility.counts.runtimeRules,
      infrastructureRules: compatibility.counts.infrastructureRules,
      supportedOperators: compatibility.supportedOperators,
      unsupportedConditions: compatibility.counts.unsupportedConditions,
    },
    null,
    2,
  ),
);
