export const permissions = {
  createRun: "create_run",
  approveGate: "approve_gate",
  denyGate: "deny_gate",
  runEvals: "run_evals",
  runAgentReview: "run_agent_review",
  exportEvidence: "export_evidence",
  routeAlerts: "route_alerts",
  viewSettings: "view_settings",
};

export const defaultActor = {
  name: "Grant Burley III",
  role: "security-reviewer",
};

const roles = [
  {
    id: "security-reviewer",
    label: "Security Reviewer",
    description: "Owns approval gates for controlled agent pilots and evidence release.",
    permissions: [
      permissions.approveGate,
      permissions.denyGate,
      permissions.createRun,
      permissions.runEvals,
      permissions.runAgentReview,
      permissions.exportEvidence,
      permissions.routeAlerts,
      permissions.viewSettings,
    ],
  },
  {
    id: "compliance-analyst",
    label: "Compliance Analyst",
    description: "Can deny risky gates, run evals, and package evidence for audit review.",
    permissions: [
      permissions.denyGate,
      permissions.createRun,
      permissions.runEvals,
      permissions.runAgentReview,
      permissions.exportEvidence,
      permissions.routeAlerts,
      permissions.viewSettings,
    ],
  },
  {
    id: "auditor",
    label: "Auditor",
    description: "Read-oriented reviewer for independent evidence and trace inspection.",
    permissions: [permissions.runAgentReview, permissions.exportEvidence, permissions.viewSettings],
  },
  {
    id: "operator",
    label: "Operator",
    description: "Can rerun technical checks but cannot decide controlled action gates.",
    permissions: [permissions.createRun, permissions.runEvals, permissions.runAgentReview],
  },
];

const roleMap = new Map(roles.map((role) => [role.id, role]));

function readHeader(headers, name) {
  return headers?.[name] || headers?.[name.toLowerCase()] || null;
}

function coerceText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function listRoles() {
  return roles.map((role) => ({
    ...role,
    permissions: [...role.permissions],
  }));
}

export function getRole(roleId) {
  return roleMap.get(roleId) || null;
}

export function resolveActor(body = {}, headers = {}) {
  const name = coerceText(
    body.reviewer || body.actorName || readHeader(headers, "x-sentinelops-reviewer"),
    defaultActor.name,
  );
  const role = coerceText(
    body.reviewerRole || body.actorRole || readHeader(headers, "x-sentinelops-role"),
    defaultActor.role,
  );
  return { name, role };
}

export function hasPermission(actor, permission) {
  const role = getRole(actor.role);
  return Boolean(role?.permissions.includes(permission));
}

export function forbiddenResponse(actor, permission) {
  const role = getRole(actor.role);
  return {
    error: "forbidden",
    message: `${role?.label || actor.role} cannot perform ${permission}.`,
    requiredPermission: permission,
    actor,
  };
}
