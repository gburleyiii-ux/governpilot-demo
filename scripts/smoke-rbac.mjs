const baseUrl = process.env.SENTINELOPS_API_BASE || "http://127.0.0.1:4175/api";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";
  return {
    ok: response.ok,
    status: response.status,
    body: contentType.includes("json") && raw ? JSON.parse(raw) : raw,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const roles = await request("/rbac/roles");
assert(roles.status === 200, `expected roles endpoint to return 200, received ${roles.status}`);
assert(roles.body.roles.length >= 4, "expected at least four local RBAC roles");

const created = await request("/runs", { method: "POST", body: "{}" });
assert(created.status === 201, `expected run creation to return 201, received ${created.status}`);
const runId = created.body.run.id;

const auditorApproval = await request(`/runs/${runId}/approval`, {
  method: "POST",
  body: JSON.stringify({
    state: "approved",
    reviewer: "Grant Burley III",
    reviewerRole: "auditor",
    note: "RBAC smoke should block auditor approval.",
  }),
});
assert(auditorApproval.status === 403, `expected auditor approval to be blocked, received ${auditorApproval.status}`);
assert(auditorApproval.body.requiredPermission === "approve_gate", "expected approve_gate to be the blocked permission");

const operatorEvidence = await request(`/runs/${runId}/evidence`, {
  headers: {
    Accept: "text/markdown",
    "x-sentinelops-reviewer": "Grant Burley III",
    "x-sentinelops-role": "operator",
  },
});
assert(operatorEvidence.status === 403, `expected operator evidence export to be blocked, received ${operatorEvidence.status}`);

const securityApproval = await request(`/runs/${runId}/approval`, {
  method: "POST",
  body: JSON.stringify({
    state: "approved",
    reviewer: "Grant Burley III",
    reviewerRole: "security-reviewer",
    note: "RBAC smoke approval for controlled pilot.",
  }),
});
assert(securityApproval.status === 200, `expected security-reviewer approval to pass, received ${securityApproval.status}`);
assert(securityApproval.body.latestApproval.reviewerRole === "security-reviewer", "expected reviewer role in approval ledger");

const auditorEvidence = await request(`/runs/${runId}/evidence`, {
  headers: {
    Accept: "text/markdown",
    "x-sentinelops-reviewer": "Grant Burley III",
    "x-sentinelops-role": "auditor",
  },
});
assert(auditorEvidence.status === 200, `expected auditor evidence export to pass, received ${auditorEvidence.status}`);
assert(auditorEvidence.body.includes("(security-reviewer)"), "expected exported evidence to include reviewer role");

console.log(
  JSON.stringify(
    {
      runId,
      roleCount: roles.body.roles.length,
      auditorApprovalBlocked: auditorApproval.status === 403,
      operatorEvidenceBlocked: operatorEvidence.status === 403,
      securityReviewerApproved: securityApproval.status === 200,
      approvalRole: securityApproval.body.latestApproval.reviewerRole,
      auditorEvidenceExported: auditorEvidence.status === 200,
    },
    null,
    2,
  ),
);
