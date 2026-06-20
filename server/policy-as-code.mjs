import { readFile } from "node:fs/promises";

const policyAsCodeUrl = new URL("./policies/policy-as-code.json", import.meta.url);
const projectRootUrl = new URL("../", import.meta.url);

export async function loadPolicyAsCode() {
  const raw = await readFile(policyAsCodeUrl, "utf8");
  return JSON.parse(raw);
}

function getPath(value, path) {
  return path.split(".").reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    return current[key];
  }, value);
}

function isNotEmpty(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

async function readTerraformFile(path, files) {
  if (!files.has(path)) {
    const fileUrl = new URL(path, projectRootUrl);
    if (!fileUrl.href.startsWith(projectRootUrl.href)) {
      throw new Error(`Policy file path escapes project root: ${path}`);
    }
    files.set(path, await readFile(fileUrl, "utf8"));
  }
  return files.get(path);
}

async function conditionValue(condition, context) {
  if (condition.source === "run") return getPath(context.run, condition.path);
  if (condition.source === "decision") return getPath(context.decision, condition.path);
  if (condition.source === "terraform") return readTerraformFile(condition.path, context.files);
  throw new Error(`Unsupported policy source: ${condition.source}`);
}

async function resolveExpected(value, context) {
  if (typeof value === "string" && value.includes(".")) {
    const [source, ...pathParts] = value.split(".");
    if (source === "run") return getPath(context.run, pathParts.join("."));
    if (source === "decision") return getPath(context.decision, pathParts.join("."));
  }
  return value;
}

async function evaluateCondition(condition, context) {
  const actual = await conditionValue(condition, context);
  const expected = await resolveExpected(condition.value, context);

  switch (condition.operator) {
    case "notEmpty":
      return isNotEmpty(actual);
    case "equals":
      return actual === expected;
    case "equalsFact":
      return actual === expected;
    case "oneOf":
      return Array.isArray(expected) && expected.includes(actual);
    case "includesAll":
      return Array.isArray(actual) && Array.isArray(expected) && expected.every((item) => actual.includes(item));
    case "contains":
      return typeof actual === "string" && typeof expected === "string" && actual.includes(expected);
    case "containsAll":
      return typeof actual === "string" && Array.isArray(expected) && expected.every((item) => actual.includes(item));
    default:
      throw new Error(`Unsupported policy operator: ${condition.operator}`);
  }
}

async function evaluateRule(rule, context) {
  const conditionResults = [];
  for (const condition of rule.conditions || []) {
    conditionResults.push(await evaluateCondition(condition, context));
  }
  const passed = conditionResults.every(Boolean);
  return {
    id: rule.id.toLowerCase(),
    label: rule.label,
    passed,
    source: rule.domain,
    severity: rule.severity,
    remediation: rule.remediation,
    failedConditions: conditionResults.filter((result) => !result).length,
  };
}

async function evaluateRules(domain, context) {
  const policy = await loadPolicyAsCode();
  const rules = policy.rules.filter((rule) => rule.domain === domain);
  const checks = [];
  for (const rule of rules) {
    checks.push(await evaluateRule(rule, context));
  }
  const status = checks.every((check) => check.passed) ? "pass" : "fail";
  return {
    id: `pac-${domain}-${Date.now().toString(36)}`,
    policyId: policy.id,
    policyName: policy.name,
    framework: policy.framework,
    status,
    recommendation:
      status === "pass"
        ? `${domain === "runtime" ? "Runtime gate" : "Infrastructure"} controls satisfy the policy-as-code bundle.`
        : "Keep the gate blocked until failing policy-as-code controls are remediated.",
    checkedAt: new Date().toISOString(),
    checks,
  };
}

export async function evaluateRuntimePolicyAsCode(run, decision) {
  return evaluateRules("runtime", {
    run,
    decision,
    files: new Map(),
  });
}

export async function evaluateInfrastructurePolicyAsCode() {
  return evaluateRules("infrastructure", {
    run: {},
    decision: {},
    files: new Map(),
  });
}
