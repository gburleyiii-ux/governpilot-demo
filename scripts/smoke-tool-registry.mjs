// Smoke for GAGS ML-3 — tool registration records write-scope + approval class.
//
// Exercises the tool registry directly (no server needed): inventory
// completeness, write-scope -> approval-class consistency, rejection of
// under-gated registrations, and activation logic (single-reviewer vs
// dual-control distinct approvers).

import {
  buildToolRegistryStatus,
  evaluateToolActivation,
  evaluateToolRecord,
} from "../server/tool-registry.mjs";

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const status = await buildToolRegistryStatus();

// 1. Inventory completeness (CM-8): every tool records BOTH fields.
check("registry has tools", status.tools.length > 0, `${status.tools.length} tools`);
check("every tool records a write-scope", status.summary.allRecordWriteScope);
check("every tool records an approval class", status.summary.allRecordApprovalClass);
check("no under-gated tool in shipped registry", status.summary.allValid, status.summary.underGated.join(", ") || "none");

// 2. Write-capable tools never use 'auto'; write-broad demands dual-control.
const writeBroad = status.tools.filter((t) => t.writeScope === "write-broad");
check("at least one write-broad tool present", writeBroad.length > 0, `${writeBroad.length}`);
check("all write-broad tools are dual-control", writeBroad.every((t) => t.approvalClass === "dual-control"));
check("no write-capable tool is 'auto'", status.tools.filter((t) => t.writeScope !== "read-only").every((t) => t.approvalClass !== "auto"));

// 3. Under-gating is REJECTED by the validator.
const underGated = evaluateToolRecord({ id: "bad-tool", writeScope: "write-broad", approvalClass: "single-reviewer" });
check("write-broad + single-reviewer flagged under-gated", !underGated.valid && underGated.violations.some((v) => v.includes("under-gated")));
const autoWrite = evaluateToolRecord({ id: "bad-auto", writeScope: "write-scoped", approvalClass: "auto" });
check("write-scoped + auto flagged invalid", !autoWrite.valid);
const missingScope = evaluateToolRecord({ id: "no-scope", approvalClass: "single-reviewer" });
check("missing write-scope flagged invalid", !missingScope.valid);

// 4. Activation logic.
check("auto activates with no approvals", evaluateToolActivation("auto", []).met);
check("single-reviewer needs >=1 approver", !evaluateToolActivation("single-reviewer", []).met && evaluateToolActivation("single-reviewer", ["grant"]).met);
check("dual-control needs 2 DISTINCT approvers", !evaluateToolActivation("dual-control", ["grant"]).met && evaluateToolActivation("dual-control", ["grant", "dana"]).met);
check("dual-control rejects same approver twice", !evaluateToolActivation("dual-control", ["grant", "grant"]).met);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
