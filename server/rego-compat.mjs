import { loadPolicyAsCode } from "./policy-as-code.mjs";

const operatorMappings = {
  notEmpty: {
    helper: "sentinelops_not_empty",
    expression: (condition) => `${regoValue(condition)} != null`,
  },
  equals: {
    helper: null,
    expression: (condition) => `${regoValue(condition)} == ${regoExpected(condition)}`,
  },
  equalsFact: {
    helper: null,
    expression: (condition) => `${regoValue(condition)} == ${regoExpected(condition)}`,
  },
  oneOf: {
    helper: "sentinelops_one_of",
    expression: (condition) => `sentinelops_one_of(${regoValue(condition)}, ${regoExpected(condition)})`,
  },
  includesAll: {
    helper: "sentinelops_includes_all",
    expression: (condition) => `sentinelops_includes_all(${regoValue(condition)}, ${regoExpected(condition)})`,
  },
  contains: {
    helper: "contains",
    expression: (condition) => `contains(${regoValue(condition)}, ${regoExpected(condition)})`,
  },
  containsAll: {
    helper: "sentinelops_contains_all",
    expression: (condition) => `sentinelops_contains_all(${regoValue(condition)}, ${regoExpected(condition)})`,
  },
};

const targetPackages = [
  { domain: "runtime", packageName: "sentinelops.runtime" },
  { domain: "infrastructure", packageName: "sentinelops.infrastructure" },
];

function regoPath(path) {
  return path
    .split(".")
    .filter(Boolean)
    .map((part) => `[${JSON.stringify(part)}]`)
    .join("");
}

function regoValue(condition) {
  if (condition.source === "run") return `input.run${regoPath(condition.path)}`;
  if (condition.source === "decision") return `input.decision${regoPath(condition.path)}`;
  if (condition.source === "terraform") return `input.files[${JSON.stringify(condition.path)}]`;
  return `input.unsupported_source[${JSON.stringify(condition.source)}]`;
}

function regoExpected(condition) {
  if (typeof condition.value === "string" && condition.value.includes(".")) {
    const [source, ...pathParts] = condition.value.split(".");
    if (source === "run") return `input.run${regoPath(pathParts.join("."))}`;
    if (source === "decision") return `input.decision${regoPath(pathParts.join("."))}`;
  }
  return JSON.stringify(condition.value);
}

function normalizeRuleId(ruleId) {
  return ruleId.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

function conditionToExpression(condition) {
  const mapping = operatorMappings[condition.operator];
  if (!mapping) {
    return {
      supported: false,
      expression: `unsupported_operator_${JSON.stringify(condition.operator)}`,
      helper: null,
    };
  }
  return {
    supported: true,
    expression: mapping.expression(condition),
    helper: mapping.helper,
  };
}

function renderRegoModule(policy, domain) {
  const rules = policy.rules.filter((rule) => rule.domain === domain);
  const lines = [
    `package sentinelops.${domain}`,
    "",
    "default allow := false",
    "",
    "allow {",
    "  count(deny) == 0",
    "}",
    "",
  ];

  for (const rule of rules) {
    const ruleId = normalizeRuleId(rule.id);
    lines.push(`deny[${JSON.stringify(rule.id)}] {`);
    lines.push(`  not ${ruleId}`);
    lines.push("}");
    lines.push("");
    lines.push(`${ruleId} {`);
    for (const condition of rule.conditions || []) {
      lines.push(`  ${conditionToExpression(condition).expression}`);
    }
    lines.push("}");
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function buildRuleMappings(policy) {
  return policy.rules.map((rule) => {
    const conditions = (rule.conditions || []).map((condition) => {
      const mapped = conditionToExpression(condition);
      return {
        source: condition.source,
        path: condition.path,
        operator: condition.operator,
        supported: mapped.supported,
        expression: mapped.expression,
      };
    });
    return {
      id: rule.id,
      domain: rule.domain,
      label: rule.label,
      severity: rule.severity,
      supported: conditions.every((condition) => condition.supported),
      conditions,
    };
  });
}

export async function buildRegoCompatibility() {
  const policy = await loadPolicyAsCode();
  const ruleMappings = buildRuleMappings(policy);
  const modules = targetPackages.map(({ domain, packageName }) => ({
    packageName,
    domain,
    path: `opa/sentinelops/${domain}.rego`,
    rego: renderRegoModule(policy, domain),
    ruleCount: policy.rules.filter((rule) => rule.domain === domain).length,
  }));
  const supportedOperators = Object.keys(operatorMappings);
  const unsupportedConditions = ruleMappings.flatMap((rule) =>
    rule.conditions
      .filter((condition) => !condition.supported)
      .map((condition) => ({
        ruleId: rule.id,
        operator: condition.operator,
        source: condition.source,
        path: condition.path,
      })),
  );
  return {
    generatedAt: new Date().toISOString(),
    compatibilityVersion: "sentinelops-opa-rego-compat/v1",
    sourcePolicyId: policy.id,
    sourcePolicyName: policy.name,
    framework: policy.framework,
    status: unsupportedConditions.length === 0 ? "compatible" : "unsupported-conditions",
    packageRoot: "sentinelops",
    supportedOperators,
    counts: {
      rules: policy.rules.length,
      runtimeRules: policy.rules.filter((rule) => rule.domain === "runtime").length,
      infrastructureRules: policy.rules.filter((rule) => rule.domain === "infrastructure").length,
      modules: modules.length,
      supportedConditions: ruleMappings.reduce(
        (total, rule) => total + rule.conditions.filter((condition) => condition.supported).length,
        0,
      ),
      unsupportedConditions: unsupportedConditions.length,
    },
    ruleMappings,
    modules,
    unsupportedConditions,
    usage: {
      inputShape: {
        run: "Assessment run object",
        decision: "Reviewer decision object",
        files: "Map of source file path to text content for Terraform-backed rules",
      },
      command: "opa eval --data opa/sentinelops --input input.json data.sentinelops.runtime.allow",
      boundary:
        "This compatibility layer exports inspectable Rego modules. The local SentinelOps runtime remains authoritative unless an approved OPA sidecar is deployed.",
    },
  };
}
