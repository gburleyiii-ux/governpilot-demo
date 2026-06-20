// GAGS ML-3 — tool registration records write-scope and approval class.
//
// A component inventory (NIST 800-53 CM-8) of agent-invocable tools / action
// groups. Each tool records a write-scope and an approval class. Write-scope
// drives the MINIMUM approval class; a registration may declare a stricter
// class but never a weaker one (that is an "under-gated" violation). The
// registry also derives, for any tool, whether a given set of recorded
// approvals is sufficient to activate it.

import { readFile } from "node:fs/promises";

const registryUrl = new URL("./tools/tool-registry.json", import.meta.url);

// Ordered strength ladders so we can compare scopes/classes numerically.
const WRITE_SCOPE_RANK = { "read-only": 0, "write-scoped": 1, "write-broad": 2 };
const APPROVAL_CLASS_RANK = { auto: 0, "single-reviewer": 1, "dual-control": 2 };

// The minimum approval class each write-scope demands.
const MIN_APPROVAL_FOR_SCOPE = {
  "read-only": "auto",
  "write-scoped": "single-reviewer",
  "write-broad": "dual-control",
};

export async function loadToolRegistry() {
  return JSON.parse(await readFile(registryUrl, "utf8"));
}

// Validate one tool record. Returns { tool, valid, violations: [] }.
export function evaluateToolRecord(tool) {
  const violations = [];
  if (!tool || typeof tool !== "object") {
    return { tool, valid: false, violations: ["record is not an object"] };
  }
  if (!tool.id) violations.push("missing id");
  if (!(tool.writeScope in WRITE_SCOPE_RANK)) {
    violations.push(`write-scope missing or unknown: ${tool.writeScope}`);
  }
  if (!(tool.approvalClass in APPROVAL_CLASS_RANK)) {
    violations.push(`approval-class missing or unknown: ${tool.approvalClass}`);
  }
  // Under-gating: declared class weaker than the scope's minimum.
  if (tool.writeScope in WRITE_SCOPE_RANK && tool.approvalClass in APPROVAL_CLASS_RANK) {
    const minClass = MIN_APPROVAL_FOR_SCOPE[tool.writeScope];
    if (APPROVAL_CLASS_RANK[tool.approvalClass] < APPROVAL_CLASS_RANK[minClass]) {
      violations.push(
        `under-gated: write-scope "${tool.writeScope}" requires at least "${minClass}", but approval-class is "${tool.approvalClass}"`,
      );
    }
    // auto is only ever permissible for read-only.
    if (tool.approvalClass === "auto" && tool.writeScope !== "read-only") {
      violations.push(`auto approval-class is not permissible for write-capable scope "${tool.writeScope}"`);
    }
  }
  return {
    tool: {
      id: tool.id,
      name: tool.name || tool.id,
      writeScope: tool.writeScope,
      approvalClass: tool.approvalClass,
      minApprovalClass: tool.writeScope in WRITE_SCOPE_RANK ? MIN_APPROVAL_FOR_SCOPE[tool.writeScope] : null,
      requiredEvidence: Array.isArray(tool.requiredEvidence) ? tool.requiredEvidence : [],
    },
    valid: violations.length === 0,
    violations,
  };
}

// Given a tool's approval class and the recorded approvers, is activation met?
// approverIds: array of distinct identities that recorded an approval.
export function evaluateToolActivation(approvalClass, approverIds = []) {
  const distinct = new Set(approverIds.filter((id) => typeof id === "string" && id.trim()));
  const required = APPROVAL_CLASS_RANK[approvalClass] ?? Infinity;
  let met = false;
  let reason = "";
  if (approvalClass === "auto") {
    met = true;
    reason = "read-only tool; no approval gate required";
  } else if (approvalClass === "single-reviewer") {
    met = distinct.size >= 1;
    reason = met ? "one approval recorded" : "no approval recorded";
  } else if (approvalClass === "dual-control") {
    met = distinct.size >= 2;
    reason = met ? "two distinct approvers recorded" : `dual-control needs 2 distinct approvers, have ${distinct.size}`;
  } else {
    reason = `unknown approval class ${approvalClass}`;
  }
  return { approvalClass, distinctApprovers: distinct.size, requiredRank: required, met, reason };
}

// Build the full registry status: validate every record, compute inventory
// completeness, and surface any under-gated tools.
export async function buildToolRegistryStatus() {
  const registry = await loadToolRegistry();
  const evaluations = (registry.tools || []).map(evaluateToolRecord);
  const tools = evaluations.map((e) => ({ ...e.tool, valid: e.valid, violations: e.violations }));
  const writeCapable = tools.filter((t) => t.writeScope && t.writeScope !== "read-only");
  return {
    generatedAt: new Date().toISOString(),
    registryId: registry.registryId,
    name: registry.name,
    framework: registry.framework,
    writeScopes: registry.writeScopes,
    approvalClasses: registry.approvalClasses,
    tools,
    summary: {
      total: tools.length,
      writeCapable: writeCapable.length,
      // Inventory completeness (CM-8): every tool records BOTH fields.
      allRecordWriteScope: tools.every((t) => Boolean(t.writeScope)),
      allRecordApprovalClass: tools.every((t) => Boolean(t.approvalClass)),
      underGated: tools.filter((t) => !t.valid).map((t) => t.id),
      allValid: tools.every((t) => t.valid),
    },
    boundary:
      "Component inventory only (CM-8). Activation enforcement against recorded approvals is evaluated per run; this registry declares the required write-scope and approval class.",
  };
}
