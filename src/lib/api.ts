import type {
  ActivePolicy,
  AlertDispatchResponse,
  AlertRoutingStatus,
  ApiRunResponse,
  CostGuardrails,
  EvalReport,
  FullAuditExport,
  GateState,
  LiveDeliveryReadiness,
  ModelGatewayStatus,
  ObservabilitySummary,
  PolicyIntelligenceStatus,
  RbacRolesResponse,
  RegoCompatibility,
  RetrievalReadiness,
  ReviewerActor,
  SystemInfo,
  TrustedWorkforceReadiness,
} from "./types";

const apiBase =
  import.meta.env.VITE_SENTINELOPS_API_BASE ||
  (import.meta.env.DEV ? "http://127.0.0.1:4175/api" : "/api");

const authTokenStorageKey = "sentinelops.authToken";

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem(authTokenStorageKey);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const error = new Error(`${options.method || "GET"} ${path} failed with ${response.status}`) as Error & {
      body?: string;
      status?: number;
    };
    error.status = response.status;
    error.body = await response.text();
    throw error;
  }

  const contentType = response.headers.get("content-type") || "";
  // A static/SPA host (or `vite preview`) answers unknown /api routes with index.html
  // and HTTP 200. That is not API data — reject so callers fall back to local mode
  // instead of treating the HTML shell as a payload.
  if (contentType.includes("text/html")) {
    const error = new Error(`${options.method || "GET"} ${path} returned HTML (no live API)`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(text) as T;
  }
  return text as T;
}

function actorPayload(actor?: ReviewerActor) {
  if (!actor) return {};
  return {
    reviewer: actor.name,
    reviewerRole: actor.role,
  };
}

function actorHeaders(actor?: ReviewerActor): Record<string, string> {
  if (!actor) return {};
  return {
    "x-sentinelops-reviewer": actor.name,
    "x-sentinelops-role": actor.role,
  };
}

export function getLatestRun() {
  return request<ApiRunResponse>("/runs/latest");
}

export function getSystemInfo() {
  return request<SystemInfo>("/system");
}

export function getActivePolicy() {
  return request<ActivePolicy>("/policies/active");
}

export function getPolicyIntelligenceStatus() {
  return request<PolicyIntelligenceStatus>("/policies/intelligence");
}

export function getModelGatewayStatus() {
  return request<ModelGatewayStatus>("/model-gateway");
}

export function getCostGuardrails() {
  return request<CostGuardrails>("/model-gateway/cost-guardrails");
}

export function getRegoCompatibility() {
  return request<RegoCompatibility>("/policies/rego");
}

export function getRetrievalReadiness() {
  return request<RetrievalReadiness>("/retrieval/readiness");
}

export function getTrustedWorkforceReadiness() {
  return request<TrustedWorkforceReadiness>("/trusted-workforce/readiness");
}

export function getLatestEvalReport() {
  return request<EvalReport>("/evals/latest");
}

export function getRbacRoles() {
  return request<RbacRolesResponse>("/rbac/roles");
}

export function getObservabilitySummary() {
  return request<ObservabilitySummary>("/observability/summary");
}

export function getAlertRoutingStatus() {
  return request<AlertRoutingStatus>("/observability/routes");
}

export function getLiveDeliveryReadiness() {
  return request<LiveDeliveryReadiness>("/observability/live-delivery");
}

export function dispatchObservabilityAlerts(actor?: ReviewerActor) {
  return request<AlertDispatchResponse>("/observability/alerts/dispatch", {
    method: "POST",
    body: JSON.stringify(actorPayload(actor)),
  });
}

export function createRun() {
  return request<ApiRunResponse>("/runs", {
    method: "POST",
    body: "{}",
  });
}

export function decideRunGate(runId: string, state: GateState, actor?: ReviewerActor) {
  return request<ApiRunResponse>(`/runs/${encodeURIComponent(runId)}/approval`, {
    method: "POST",
    body: JSON.stringify({
      state,
      ...actorPayload(actor),
      note: "Reviewer decision recorded from SentinelOps dashboard.",
    }),
  });
}

export function runEvalPack(runId: string, actor?: ReviewerActor) {
  return request<ApiRunResponse>(`/runs/${encodeURIComponent(runId)}/evals`, {
    method: "POST",
    body: JSON.stringify(actorPayload(actor)),
  });
}

export function runAgentReview(runId: string, actor?: ReviewerActor) {
  return request<ApiRunResponse>(`/runs/${encodeURIComponent(runId)}/agent-review`, {
    method: "POST",
    body: JSON.stringify(actorPayload(actor)),
  });
}

export function exportRunEvidence(runId: string, actor?: ReviewerActor) {
  return request<string>(`/runs/${encodeURIComponent(runId)}/evidence`, {
    headers: {
      Accept: "text/markdown",
      ...actorHeaders(actor),
    },
  });
}

export function getFullAuditExport(actor?: ReviewerActor) {
  return request<FullAuditExport>("/audit/export", {
    headers: actorHeaders(actor),
  });
}
