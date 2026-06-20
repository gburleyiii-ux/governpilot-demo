// GAGS IA-4 — multi-tenant isolation.
//
// Runs, approvals, and evidence are scoped to a tenant. A request resolves to
// exactly one tenant (header `x-sentinelops-tenant`, body `tenantId`, or the
// default), and every run-scoped read/write is filtered so one tenant can never
// see, approve, or export another tenant's resources. Cross-tenant access is
// answered with the same 404 a missing record would produce, so the boundary
// does not leak the existence of another tenant's runs.
//
// Backward compatibility: records (and state files) that predate tenancy carry
// no `tenantId`; `tenantOf` treats those as the default tenant, so existing
// state stays loadable and the single-tenant default path is unchanged.

export const DEFAULT_TENANT_ID = "gp-default";

// Demo tenant registry. A real deployment would source this from the control
// plane's tenant directory; here it is an explicit allow-list so the isolation
// boundary is testable and unknown tenants are rejected rather than silently
// auto-provisioned.
const tenants = [
  { id: DEFAULT_TENANT_ID, label: "GovernPilot (default)", description: "Default single-tenant workspace for the reference implementation." },
  { id: "tenant-alpha", label: "Tenant Alpha", description: "Isolated demonstration tenant A." },
  { id: "tenant-bravo", label: "Tenant Bravo", description: "Isolated demonstration tenant B." },
];

const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));

const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

export function listTenants() {
  return tenants.map((tenant) => ({ ...tenant }));
}

export function getTenant(tenantId) {
  return tenantMap.get(tenantId) || null;
}

function readHeader(headers, name) {
  return headers?.[name] || headers?.[name.toLowerCase()] || null;
}

// Resolve the tenant for a request. Precedence: explicit header, then body,
// then the default tenant. A well-formed but unregistered tenant id is rejected
// (400) so isolation is never bypassed by inventing a tenant; a malformed id is
// also rejected.
export function resolveTenant(body = {}, headers = {}) {
  const raw =
    readHeader(headers, "x-sentinelops-tenant") ||
    (typeof body.tenantId === "string" ? body.tenantId : null);

  if (!raw) {
    return { ok: true, tenantId: DEFAULT_TENANT_ID };
  }
  const candidate = raw.trim().toLowerCase();
  if (!TENANT_ID_PATTERN.test(candidate)) {
    return { ok: false, status: 400, error: "invalid_tenant", message: `Tenant id "${raw}" is not a valid tenant identifier.` };
  }
  if (!tenantMap.has(candidate)) {
    return { ok: false, status: 400, error: "unknown_tenant", message: `Tenant "${candidate}" is not a registered tenant.` };
  }
  return { ok: true, tenantId: candidate };
}

// The tenant a record belongs to. Untagged (legacy) records belong to the
// default tenant so pre-tenancy state remains visible on the default path.
export function tenantOf(record) {
  return record?.tenantId || DEFAULT_TENANT_ID;
}

export function belongsToTenant(record, tenantId) {
  return tenantOf(record) === tenantId;
}

// Filter a list of records down to a single tenant's scope.
export function scopeToTenant(list = [], tenantId) {
  return list.filter((record) => belongsToTenant(record, tenantId));
}
