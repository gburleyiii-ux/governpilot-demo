import http from "node:http";
import { readFile } from "node:fs/promises";
import { getAgentRuntimeMode, runDeploymentReview } from "../agent/sentinelops-agent.mjs";
import { listAlertRoutes, routeObservabilityAlerts, verifyAlertDispatchLedger } from "./alert-routing.mjs";
import { applyGateDecision, buildEvidencePacket, createAssessmentRun, rerunEvalPack } from "./assessment-engine.mjs";
import { buildEvidenceBundle, buildEvidenceManifest, buildFullAuditExport, verifyApprovalLedger } from "./audit-integrity.mjs";
import { assertAuthPostureOrExit, authContext, resolveRequestActor, unauthorizedResponse } from "./auth.mjs";
import { buildCostGuardrails } from "./cost-guardrails.mjs";
import { assertPilotDataBoundary, buildDataProtectionStatus } from "./data-protection.mjs";
import {
  applyHealthApproval,
  assertNoRawSample,
  buildHealthApproval,
  buildHealthEvidencePacket,
  buildHealthRun,
  verifyApprovalLedger as verifyHealthApprovalLedger,
} from "./health-run.mjs";
import { executeLiveAlertDelivery } from "./live-delivery-executor.mjs";
import { buildLiveDeliveryReadiness } from "./live-delivery-readiness.mjs";
import { buildModelGatewayStatus } from "./model-gateway.mjs";
import { buildObservabilitySummary } from "./observability.mjs";
import { evaluateInfrastructurePolicyAsCode, loadPolicyAsCode } from "./policy-as-code.mjs";
import { buildPolicyIntelligenceStatus } from "./policy-intelligence.mjs";
import { loadPolicy } from "./policy-engine.mjs";
import { defaultActor, forbiddenResponse, hasPermission, listRoles, permissions } from "./rbac.mjs";
import { buildRegoCompatibility } from "./rego-compat.mjs";
import { buildToolRegistryStatus } from "./tool-registry.mjs";
import { buildHealthForwardReadiness } from "./health-forward-controls.mjs";
import { buildRetrievalReadiness } from "./retrieval-readiness.mjs";
import { assertSigningPostureOrExit } from "./signing-guard.mjs";
import { assertStripePostureOrExit, evaluateStripePosture, stripeStatus, verifyStripeWebhookSignature } from "./stripe-guard.mjs";
import { DEFAULT_TENANT_ID, belongsToTenant, listTenants, resolveTenant, scopeToTenant } from "./tenancy.mjs";
import { getStorageInfo, loadState, saveEvidencePacket, updateState } from "./store.mjs";
import { buildTrustedWorkforceEvidence, buildTrustedWorkforceReadiness } from "./trusted-workforce.mjs";

const port = Number(process.env.SENTINELOPS_API_PORT || process.env.PORT || 4175);
const host = process.env.SENTINELOPS_API_HOST || "127.0.0.1";
const serviceVersion = "0.22.0";
const evalResultUrl = new URL("../evals/results/latest.json", import.meta.url);
const distUrl = new URL("../dist/", import.meta.url);
const portfolioAssetsUrl = new URL("../docs/design/", import.meta.url);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".vtt": "text/vtt; charset=utf-8",
  ".webp": "image/webp",
};

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self' http://127.0.0.1:* http://localhost:*; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

const defaultCorsOrigins = [
  "http://127.0.0.1:4175",
  "http://localhost:4175",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4187",
  "http://localhost:4187",
];

function configuredCorsOrigins() {
  return (process.env.SENTINELOPS_CORS_ORIGINS || defaultCorsOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsHeaders(req) {
  const origin = req?.headers?.origin;
  const allowedOrigins = configuredCorsOrigins();
  const headers = {
    "Access-Control-Allow-Headers": "accept,authorization,content-type,x-sentinelops-reviewer,x-sentinelops-role",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  if (origin && (allowedOrigins.includes("*") || allowedOrigins.includes(origin))) {
    headers["Access-Control-Allow-Origin"] = allowedOrigins.includes("*") ? "*" : origin;
  }
  return headers;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    ...securityHeaders,
    "Cache-Control": "no-store",
    ...corsHeaders(res.sentinelopsRequest),
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(body);
}

function text(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    ...securityHeaders,
    "Cache-Control": "no-store",
    ...corsHeaders(res.sentinelopsRequest),
    "Content-Type": contentType,
  });
  res.end(body);
}

function extensionFor(pathname) {
  const dotIndex = pathname.lastIndexOf(".");
  return dotIndex === -1 ? "" : pathname.slice(dotIndex);
}

async function serveStatic(pathname, res) {
  const candidatePath = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = candidatePath.replace(/^\/+/, "");
  const fileUrl = new URL(normalizedPath, distUrl);
  if (!fileUrl.href.startsWith(distUrl.href)) {
    return false;
  }

  try {
    const body = await readFile(fileUrl);
    res.writeHead(200, {
      ...securityHeaders,
      "Content-Type": contentTypes[extensionFor(candidatePath)] || "application/octet-stream",
    });
    res.end(body);
    return true;
  } catch (error) {
    if (error.code !== "ENOENT" || extensionFor(candidatePath)) {
      return false;
    }
    try {
      const body = await readFile(new URL("index.html", distUrl));
      res.writeHead(200, {
        ...securityHeaders,
        "Content-Type": contentTypes[".html"],
      });
      res.end(body);
      return true;
    } catch {
      return false;
    }
  }
}

async function servePortfolioAsset(pathname, res) {
  if (!pathname.startsWith("/portfolio-assets/")) {
    return false;
  }
  const assetName = decodeURIComponent(pathname.replace(/^\/portfolio-assets\//, ""));
  if (!/^[a-z0-9_.-]+\.png$/i.test(assetName)) {
    return false;
  }
  const fileUrl = new URL(assetName, portfolioAssetsUrl);
  if (!fileUrl.href.startsWith(portfolioAssetsUrl.href)) {
    return false;
  }

  try {
    const body = await readFile(fileUrl);
    res.writeHead(200, {
      ...securityHeaders,
      "Cache-Control": "public, max-age=300",
      "Content-Type": "image/png",
    });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

async function readJson(req) {
  const chunks = [];
  let receivedBytes = 0;
  const maxBytes = Number(process.env.SENTINELOPS_MAX_JSON_BYTES || 1_048_576);
  for await (const chunk of req) {
    receivedBytes += chunk.length;
    if (receivedBytes > maxBytes) {
      const error = new Error(`JSON request body exceeds ${maxBytes} bytes`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    assertPilotDataBoundary(parsed);
    return parsed;
  } catch (error) {
    if (error?.statusCode) {
      throw error;
    }
    const invalidJsonError = new Error("Request body must be valid JSON.");
    invalidJsonError.statusCode = 400;
    throw invalidJsonError;
  }
}

function apiResponse(state, run, policyResult = null, approvalRecord = null) {
  const approvals = state.approvals.filter((approval) => approval.runId === run.id);
  const policyChecks = state.policyChecks.filter((check) => check.runId === run.id || check.traceId === run.traceId);
  const agentReviews = state.agentReviews.filter((review) => review.runId === run.id || review.traceId === run.traceId);
  const storage = getStorageInfo();
  return {
    run,
    approvals,
    policyChecks,
    agentReviews,
    latestPolicyCheck: policyResult || policyChecks[0] || null,
    latestApproval: approvalRecord || approvals[0] || null,
    latestAgentReview: agentReviews[0] || null,
    storage,
  };
}

// H11: GET /api/runs/latest is read-only — never create runs/audit here.
// Creating assessments requires POST /api/runs with auth + create_run.
async function getLatestRun() {
  const state = await loadState();
  if (!Array.isArray(state.runs) || state.runs.length === 0) {
    return {
      run: null,
      approvals: [],
      policyChecks: [],
      agentReviews: [],
      latestPolicyCheck: null,
      latestApproval: null,
      latestAgentReview: null,
      storage: getStorageInfo(),
    };
  }
  return apiResponse(state, state.runs[0]);
}

function findRun(state, runId, tenantId = DEFAULT_TENANT_ID) {
  const index = state.runs.findIndex((run) => run.id === runId);
  // Tenant-scope the lookup: a run owned by another tenant is reported as
  // not-found (IA-4) so the boundary never confirms its existence.
  if (index === -1 || !belongsToTenant(state.runs[index], tenantId)) {
    return null;
  }
  return { run: state.runs[index], index };
}

async function latestEvalReport() {
  try {
    const raw = await readFile(evalResultUrl, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        generatedAt: null,
        mode: getAgentRuntimeMode(),
        total: 0,
        passed: 0,
        failed: 0,
        results: [],
      };
    }
    throw error;
  }
}

async function observabilitySummary(state, storage = getStorageInfo()) {
  return buildObservabilitySummary(state, {
    service: "sentinelops-api",
    version: serviceVersion,
    storage,
    authMode: authContext().mode,
    agentMode: getAgentRuntimeMode(),
    evalReport: await latestEvalReport(),
  });
}

const server = http.createServer(async (req, res) => {
  res.sentinelopsRequest = req;
  try {
    if (req.method === "OPTIONS") {
      return text(res, 204, "");
    }

    const url = new URL(req.url || "/", `http://${host}:${port}`);
    const pathname = url.pathname;

    if (req.method === "GET") {
      const servedAsset = await servePortfolioAsset(pathname, res);
      if (servedAsset) return;
    }

    if (req.method === "GET" && pathname === "/api/health") {
      const state = await loadState();
      const storage = getStorageInfo();
      return json(res, 200, {
        ok: true,
        service: "sentinelops-api",
        version: serviceVersion,
        storagePath: storage.path,
        storageMode: storage.mode,
        authMode: authContext().mode,
        runCount: state.runs.length,
        roleCount: listRoles().length,
        alertDispatchCount: state.alertDispatches.length,
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
        agentMode: getAgentRuntimeMode(),
      });
    }

    if (req.method === "GET" && pathname === "/api/system") {
      const state = await loadState();
      const storage = getStorageInfo();
      return json(res, 200, {
        service: "sentinelops-api",
        version: serviceVersion,
        storagePath: storage.path,
        storageMode: storage.mode,
        storage,
        auth: authContext(),
        runCount: state.runs.length,
        approvalCount: state.approvals.length,
        policyCheckCount: state.policyChecks.length,
        agentReviewCount: state.agentReviews.length,
        alertDispatchCount: state.alertDispatches.length,
        roleCount: listRoles().length,
        defaultActor,
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
        agentMode: getAgentRuntimeMode(),
      });
    }

    if (req.method === "GET" && pathname === "/api/rbac/roles") {
      return json(res, 200, {
        defaultActor,
        auth: authContext(),
        roles: listRoles(),
      });
    }

    if (req.method === "GET" && pathname === "/api/auth/context") {
      return json(res, 200, {
        auth: authContext(),
        roles: listRoles(),
      });
    }

    if (req.method === "GET" && pathname === "/api/tenants") {
      const tenant = resolveTenant({}, req.headers);
      if (!tenant.ok) {
        return json(res, tenant.status, { error: tenant.error, message: tenant.message });
      }
      return json(res, 200, {
        activeTenant: tenant.tenantId,
        tenants: listTenants(),
        isolation:
          "Runs, approvals, and evidence are scoped per tenant (GAGS IA-4). Cross-tenant access is answered as not-found.",
      });
    }

    if (req.method === "GET" && pathname === "/api/data-protection") {
      return json(res, 200, buildDataProtectionStatus());
    }

    if (req.method === "GET" && pathname === "/api/health/forward-readiness") {
      // Forward-looking regime posture (HX-9-11 NPRM, HX-17b Colorado, HX-18 EU).
      // Informational control catalog + honest legal status; no PHI, no obligation asserted.
      return json(res, 200, buildHealthForwardReadiness({}));
    }

    if (req.method === "GET" && pathname === "/api/policies/active") {
      return json(res, 200, await loadPolicy());
    }

    if (req.method === "GET" && pathname === "/api/policies/as-code") {
      return json(res, 200, await loadPolicyAsCode());
    }

    if (req.method === "GET" && pathname === "/api/policies/intelligence") {
      return json(
        res,
        200,
        await buildPolicyIntelligenceStatus({
          service: "sentinelops-api",
          version: serviceVersion,
          env: process.env,
        }),
      );
    }

    if (req.method === "GET" && pathname === "/api/policies/infrastructure") {
      return json(res, 200, await evaluateInfrastructurePolicyAsCode());
    }

    if (req.method === "GET" && pathname === "/api/policies/rego") {
      return json(res, 200, await buildRegoCompatibility());
    }

    if (req.method === "GET" && pathname === "/api/tools/registry") {
      return json(res, 200, await buildToolRegistryStatus());
    }

    if (req.method === "GET" && pathname === "/api/model-gateway") {
      return json(
        res,
        200,
        buildModelGatewayStatus({
          service: "sentinelops-api",
          version: serviceVersion,
          storage: getStorageInfo(),
          authMode: authContext().mode,
          agentMode: getAgentRuntimeMode(),
        }),
      );
    }

    if (req.method === "GET" && pathname === "/api/model-gateway/cost-guardrails") {
      return json(
        res,
        200,
        buildCostGuardrails({
          service: "sentinelops-api",
          version: serviceVersion,
          storage: getStorageInfo(),
          authMode: authContext().mode,
          agentMode: getAgentRuntimeMode(),
        }),
      );
    }

    if (req.method === "GET" && pathname === "/api/retrieval/readiness") {
      return json(
        res,
        200,
        await buildRetrievalReadiness({
          service: "sentinelops-api",
          version: serviceVersion,
          storage: getStorageInfo(),
          authMode: authContext().mode,
          agentMode: getAgentRuntimeMode(),
        }),
      );
    }

    if (req.method === "GET" && pathname === "/api/trusted-workforce/readiness") {
      return json(
        res,
        200,
        buildTrustedWorkforceReadiness({
          service: "sentinelops-api",
          version: serviceVersion,
          storage: getStorageInfo(),
          authMode: authContext().mode,
          agentMode: getAgentRuntimeMode(),
          env: process.env,
        }),
      );
    }

    if (req.method === "GET" && pathname === "/api/trusted-workforce/sources") {
      const readiness = buildTrustedWorkforceReadiness({
        service: "sentinelops-api",
        version: serviceVersion,
        storage: getStorageInfo(),
        authMode: authContext().mode,
        agentMode: getAgentRuntimeMode(),
        env: process.env,
      });
      return json(res, 200, {
        generatedAt: readiness.generatedAt,
        readinessVersion: readiness.readinessVersion,
        status: readiness.status,
        sources: readiness.sources,
        dataBoundary: readiness.dataBoundary,
      });
    }

    if (req.method === "GET" && pathname === "/api/trusted-workforce/process") {
      const readiness = buildTrustedWorkforceReadiness({
        service: "sentinelops-api",
        version: serviceVersion,
        storage: getStorageInfo(),
        authMode: authContext().mode,
        agentMode: getAgentRuntimeMode(),
        env: process.env,
      });
      return json(res, 200, {
        generatedAt: readiness.generatedAt,
        readinessVersion: readiness.readinessVersion,
        status: readiness.status,
        lifecycle: readiness.lifecycle,
        procedures: readiness.procedures,
        humanDecisionBoundary: readiness.humanDecisionBoundary,
      });
    }

    if (req.method === "GET" && pathname === "/api/trusted-workforce/work-instructions") {
      const readiness = buildTrustedWorkforceReadiness({
        service: "sentinelops-api",
        version: serviceVersion,
        storage: getStorageInfo(),
        authMode: authContext().mode,
        agentMode: getAgentRuntimeMode(),
        env: process.env,
      });
      return json(res, 200, {
        generatedAt: readiness.generatedAt,
        readinessVersion: readiness.readinessVersion,
        status: readiness.status,
        workInstructions: readiness.workInstructions,
        dataBoundary: readiness.dataBoundary,
      });
    }

    if (req.method === "GET" && pathname === "/api/trusted-workforce/evidence") {
      const evidence = buildTrustedWorkforceEvidence({
        service: "sentinelops-api",
        version: serviceVersion,
        storage: getStorageInfo(),
        authMode: authContext().mode,
        agentMode: getAgentRuntimeMode(),
        env: process.env,
      });
      const accept = req.headers.accept || "";
      if (accept.includes("text/markdown")) {
        return text(res, 200, evidence.evidenceMarkdown, "text/markdown; charset=utf-8");
      }
      return json(res, 200, evidence);
    }

    if (req.method === "GET" && pathname === "/api/evals/latest") {
      return json(res, 200, await latestEvalReport());
    }

    if (req.method === "GET" && pathname === "/api/observability/summary") {
      const state = await loadState();
      const storage = getStorageInfo();
      return json(res, 200, await observabilitySummary(state, storage));
    }

    if (req.method === "GET" && pathname === "/api/observability/routes") {
      const state = await loadState();
      return json(res, 200, {
        routes: listAlertRoutes(),
        dispatches: state.alertDispatches.slice(0, 12),
        ledger: verifyAlertDispatchLedger(state.alertDispatches),
      });
    }

    if (req.method === "GET" && pathname === "/api/observability/live-delivery") {
      return json(
        res,
        200,
        buildLiveDeliveryReadiness({
          service: "sentinelops-api",
          version: serviceVersion,
          storage: getStorageInfo(),
          authMode: authContext().mode,
          agentMode: getAgentRuntimeMode(),
        }),
      );
    }

    if (req.method === "GET" && pathname === "/api/observability/siem") {
      const state = await loadState();
      const summary = await observabilitySummary(state);
      const projected = routeObservabilityAlerts(summary, { name: "SentinelOps AI", role: "system" }, null);
      return json(res, 200, {
        format: "ocsf-like-json",
        generatedAt: new Date().toISOString(),
        latestRunId: summary.latestRunId,
        events: projected.siemEvents,
        dispatchLedger: verifyAlertDispatchLedger(state.alertDispatches),
      });
    }

    if (req.method === "POST" && pathname === "/api/observability/alerts/dispatch") {
      const body = await readJson(req);
      const authResult = await resolveRequestActor(body, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.routeAlerts)) {
        return json(res, 403, forbiddenResponse(actor, permissions.routeAlerts));
      }
      const response = await updateState(async (state) => {
        const summary = await observabilitySummary(state);
        const routed = routeObservabilityAlerts(summary, actor, state.alertDispatches[0]?.signature || null);
        state.alertDispatches.unshift(...routed.dispatches);
        state.auditEvents.unshift({
          id: `audit-${Date.now().toString(36)}`,
          at: new Date().toISOString(),
          runId: summary.latestRunId || "none",
          event: `${routed.dispatches.length} observability alert dispatch records simulated by ${actor.name} as ${actor.role}.`,
        });
        return {
          summary,
          routes: routed.routes,
          dispatches: routed.dispatches,
          siemEvents: routed.siemEvents,
          ledger: verifyAlertDispatchLedger(state.alertDispatches),
        };
      });
      return json(res, 200, response);
    }

    if (req.method === "POST" && pathname === "/api/observability/alerts/live-dispatch") {
      const body = await readJson(req);
      const authResult = await resolveRequestActor(body, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.routeAlerts)) {
        return json(res, 403, forbiddenResponse(actor, permissions.routeAlerts));
      }
      const storage = getStorageInfo();
      const response = await updateState(async (state) => {
        const summary = await observabilitySummary(state);
        const executed = await executeLiveAlertDelivery({
          summary,
          actor,
          previousHash: state.alertDispatches[0]?.signature || null,
          env: process.env,
          service: "sentinelops-api",
          version: serviceVersion,
          authMode: authContext().mode,
          agentMode: getAgentRuntimeMode(),
          storage,
        });
        if (executed.executed) {
          state.alertDispatches.unshift(...executed.dispatches);
          state.liveDeliveryExecutions.unshift({
            id: `live-delivery-${Date.now().toString(36)}`,
            at: new Date().toISOString(),
            actorName: actor.name,
            actorRole: actor.role,
            status: executed.status,
            attemptCount: executed.attempts.length,
            dispatchCount: executed.dispatches.length,
            siemEventCount: executed.siemEvents.length,
            providerIds: [...new Set(executed.attempts.map((attempt) => attempt.providerId))],
            secretDisclosureDetected: executed.secretDisclosureDetected,
          });
          state.auditEvents.unshift({
            id: `audit-${Date.now().toString(36)}`,
            at: new Date().toISOString(),
            runId: summary.latestRunId || "none",
            event: `${executed.dispatches.length} live alert dispatch records executed by ${actor.name} as ${actor.role}.`,
          });
        } else {
          state.auditEvents.unshift({
            id: `audit-${Date.now().toString(36)}`,
            at: new Date().toISOString(),
            runId: summary.latestRunId || "none",
            event: `Live alert delivery blocked for ${actor.name} as ${actor.role}: ${executed.reason}`,
          });
        }
        return {
          summary,
          ...executed,
          ledger: verifyAlertDispatchLedger(state.alertDispatches),
        };
      });
      return json(res, response.executed ? 200 : 409, response);
    }

    const trustedWorkforceApprovalMatch = pathname.match(/^\/api\/trusted-workforce\/process\/([^/]+)\/approval$/);
    if (req.method === "POST" && trustedWorkforceApprovalMatch) {
      const procedureId = decodeURIComponent(trustedWorkforceApprovalMatch[1]);
      const body = await readJson(req);
      if (!["approved", "denied"].includes(body.state)) {
        return json(res, 400, { error: "state must be approved or denied" });
      }
      const authResult = await resolveRequestActor(body, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      const requiredPermission = body.state === "approved" ? permissions.approveGate : permissions.denyGate;
      if (!hasPermission(actor, requiredPermission)) {
        return json(res, 403, forbiddenResponse(actor, requiredPermission));
      }
      const readiness = buildTrustedWorkforceReadiness({
        service: "sentinelops-api",
        version: serviceVersion,
        storage: getStorageInfo(),
        authMode: authContext().mode,
        agentMode: getAgentRuntimeMode(),
        env: process.env,
      });
      const procedure = readiness.procedures.find((item) => item.id === procedureId);
      if (!procedure) {
        return json(res, 404, { error: "trusted workforce procedure not found", procedureId });
      }
      return json(res, 200, {
        procedure,
        decision: {
          id: `tw-decision-${Date.now().toString(36)}`,
          procedureId,
          state: body.state,
          reviewer: actor.name,
          reviewerRole: actor.role,
          note: body.note || "Trusted Workforce readiness decision recorded.",
          decidedAt: new Date().toISOString(),
          persisted: false,
          boundary: "First release returns a review decision without writing live NBIS or applicant data.",
        },
        controls: readiness.controls,
        dataBoundary: readiness.dataBoundary,
      });
    }

    // ---- GAGS-HEALTH run lifecycle (persisted, signed, audited) ----------------
    // No live PHI is ever stored or returned. The de-identification sample is
    // evaluated then dropped at the boundary; only the RESULT is persisted.

    if (req.method === "POST" && pathname === "/api/health/runs") {
      const body = await readJson(req);
      const authResult = await resolveRequestActor(body, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.createRun)) {
        return json(res, 403, forbiddenResponse(actor, permissions.createRun));
      }
      const tenant = resolveTenant(body, req.headers);
      if (!tenant.ok) {
        return json(res, tenant.status, { error: tenant.error, message: tenant.message });
      }
      const response = await updateState((state) => {
        state.healthSequence += 1;
        const previousRunHash = state.healthRuns[0]?.signature || null;
        const run = buildHealthRun({
          body,
          actor,
          sequence: state.healthSequence,
          previousRunHash,
          tenantId: tenant.tenantId,
        });
        // Defense-in-depth: never let a raw de-id sample reach persisted state.
        assertNoRawSample(run);
        state.healthRuns.unshift(run);
        state.auditEvents.unshift({
          id: `audit-${Date.now().toString(36)}`,
          at: new Date().toISOString(),
          runId: run.id,
          event: `Health AI run created by ${actor.name} as ${actor.role} (FDA track: ${run.fdaRouting.track}).`,
        });
        return { run };
      });
      return json(res, 201, response);
    }

    const healthApprovalMatch = pathname.match(/^\/api\/health\/runs\/([^/]+)\/approval$/);
    if (req.method === "POST" && healthApprovalMatch) {
      const runId = decodeURIComponent(healthApprovalMatch[1]);
      const body = await readJson(req);
      if (!["approved", "denied"].includes(body.state)) {
        return json(res, 400, { error: "state must be approved or denied" });
      }
      const authResult = await resolveRequestActor(body, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      const requiredPermission = body.state === "approved" ? permissions.approveGate : permissions.denyGate;
      if (!hasPermission(actor, requiredPermission)) {
        return json(res, 403, forbiddenResponse(actor, requiredPermission));
      }
      const tenant = resolveTenant(body, req.headers);
      if (!tenant.ok) {
        return json(res, tenant.status, { error: tenant.error, message: tenant.message });
      }
      const response = await updateState((state) => {
        const index = state.healthRuns.findIndex(
          (candidate) => candidate.id === runId && belongsToTenant(candidate, tenant.tenantId),
        );
        if (index === -1) {
          return null;
        }
        const run = state.healthRuns[index];
        const previousApprovalHash = state.healthApprovals[0]?.signature || null;
        const approvalRecord = buildHealthApproval({
          run,
          decision: { state: body.state, note: body.note },
          actor,
          previousApprovalHash,
        });
        const updatedRun = applyHealthApproval(run, approvalRecord);
        state.healthRuns[index] = updatedRun;
        state.healthApprovals.unshift(approvalRecord);
        state.auditEvents.unshift({
          id: `audit-${Date.now().toString(36)}`,
          at: new Date().toISOString(),
          runId: run.id,
          event: `Health run ${body.state} decision signed by ${actor.name} as ${actor.role}.`,
        });
        const approvals = state.healthApprovals.filter((a) => a.runId === runId);
        return {
          run: updatedRun,
          approval: approvalRecord,
          approvals,
          approvalLedger: verifyHealthApprovalLedger(approvals),
        };
      });
      if (!response) {
        return json(res, 404, { error: `health run ${runId} not found` });
      }
      return json(res, 200, response);
    }

    const healthEvidenceMatch = pathname.match(/^\/api\/health\/runs\/([^/]+)\/evidence$/);
    if (req.method === "GET" && healthEvidenceMatch) {
      const runId = decodeURIComponent(healthEvidenceMatch[1]);
      const authResult = await resolveRequestActor({}, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.exportEvidence)) {
        return json(res, 403, forbiddenResponse(actor, permissions.exportEvidence));
      }
      const tenant = resolveTenant({}, req.headers);
      if (!tenant.ok) {
        return json(res, tenant.status, { error: tenant.error, message: tenant.message });
      }
      const state = await loadState();
      const run = state.healthRuns.find(
        (candidate) => candidate.id === runId && belongsToTenant(candidate, tenant.tenantId),
      );
      if (!run) {
        return json(res, 404, { error: `health run ${runId} not found` });
      }
      const approvals = state.healthApprovals.filter((a) => a.runId === runId);
      const packet = buildHealthEvidencePacket(run, approvals);
      // Defense-in-depth: assert no raw PHI sample before persisting/returning.
      assertNoRawSample(packet);
      await saveEvidencePacket(`${runId}-health`, JSON.stringify(packet, null, 2));
      return json(res, 200, packet);
    }

    const healthRunMatch = pathname.match(/^\/api\/health\/runs\/([^/]+)$/);
    if (req.method === "GET" && healthRunMatch) {
      const runId = decodeURIComponent(healthRunMatch[1]);
      const authResult = await resolveRequestActor({}, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.viewSettings)) {
        return json(res, 403, forbiddenResponse(actor, permissions.viewSettings));
      }
      const tenant = resolveTenant({}, req.headers);
      if (!tenant.ok) {
        return json(res, tenant.status, { error: tenant.error, message: tenant.message });
      }
      const state = await loadState();
      const run = state.healthRuns.find(
        (candidate) => candidate.id === runId && belongsToTenant(candidate, tenant.tenantId),
      );
      if (!run) {
        return json(res, 404, { error: `health run ${runId} not found` });
      }
      const approvals = state.healthApprovals.filter((a) => a.runId === runId);
      return json(res, 200, {
        run,
        approvals,
        approvalLedger: verifyHealthApprovalLedger(approvals),
      });
    }

    if (req.method === "GET" && pathname === "/api/health/runs") {
      const authResult = await resolveRequestActor({}, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.viewSettings)) {
        return json(res, 403, forbiddenResponse(actor, permissions.viewSettings));
      }
      const tenant = resolveTenant({}, req.headers);
      if (!tenant.ok) {
        return json(res, tenant.status, { error: tenant.error, message: tenant.message });
      }
      const state = await loadState();
      const tenantRuns = scopeToTenant(state.healthRuns, tenant.tenantId);
      const tenantRunIds = new Set(tenantRuns.map((r) => r.id));
      const tenantApprovals = state.healthApprovals.filter((a) => tenantRunIds.has(a.runId));
      return json(res, 200, {
        count: tenantRuns.length,
        tenant: tenant.tenantId,
        runs: tenantRuns,
        approvalLedger: verifyHealthApprovalLedger(tenantApprovals),
      });
    }

    if (req.method === "GET" && pathname === "/api/runs/latest") {
      return json(res, 200, await getLatestRun());
    }

    if (req.method === "POST" && pathname === "/api/runs") {
      const body = await readJson(req);
      const authResult = await resolveRequestActor(body, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.createRun)) {
        return json(res, 403, forbiddenResponse(actor, permissions.createRun));
      }
      const tenant = resolveTenant(body, req.headers);
      if (!tenant.ok) {
        return json(res, tenant.status, { error: tenant.error, message: tenant.message });
      }
      const response = await updateState((state) => {
        state.sequence += 1;
        const run = createAssessmentRun(state.sequence);
        run.tenantId = tenant.tenantId;
        state.runs.unshift(run);
        state.auditEvents.unshift({
          id: `audit-${Date.now().toString(36)}`,
          at: new Date().toISOString(),
          runId: run.id,
          event: `New assessment run created by ${actor.name} as ${actor.role} for tenant ${tenant.tenantId}.`,
        });
        return apiResponse(state, run);
      });
      return json(res, 201, response);
    }

    const approvalMatch = pathname.match(/^\/api\/runs\/([^/]+)\/approval$/);
    if (req.method === "POST" && approvalMatch) {
      const runId = decodeURIComponent(approvalMatch[1]);
      const body = await readJson(req);
      if (!["approved", "denied"].includes(body.state)) {
        return json(res, 400, { error: "state must be approved or denied" });
      }
      const authResult = await resolveRequestActor(body, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      const requiredPermission = body.state === "approved" ? permissions.approveGate : permissions.denyGate;
      if (!hasPermission(actor, requiredPermission)) {
        return json(res, 403, forbiddenResponse(actor, requiredPermission));
      }
      const tenant = resolveTenant(body, req.headers);
      if (!tenant.ok) {
        return json(res, tenant.status, { error: tenant.error, message: tenant.message });
      }
      const response = await updateState(async (state) => {
        const found = findRun(state, runId, tenant.tenantId);
        if (!found) {
          return null;
        }
        const previousApprovalHash = state.approvals[0]?.signature || null;
        const decision = {
          state: body.state,
          reviewer: actor.name,
          reviewerRole: actor.role,
          note: body.note || "Reviewer decision recorded from SentinelOps UI.",
        };
        const { run, approvalRecord, policyResult } = await applyGateDecision(found.run, decision, previousApprovalHash);
        state.runs[found.index] = run;
        state.approvals.unshift(approvalRecord);
        state.policyChecks.unshift({
          ...policyResult,
          runId: run.id,
          traceId: run.traceId,
        });
        state.auditEvents.unshift({
          id: `audit-${Date.now().toString(36)}`,
          at: new Date().toISOString(),
          runId: run.id,
          event: `${decision.state} decision signed by ${decision.reviewer} as ${decision.reviewerRole} via ${actor.authSource}.`,
        });
        return apiResponse(state, run, policyResult, approvalRecord);
      });
      if (!response) {
        return json(res, 404, { error: `run ${runId} not found` });
      }
      return json(res, 200, response);
    }

    const evalMatch = pathname.match(/^\/api\/runs\/([^/]+)\/evals$/);
    if (req.method === "POST" && evalMatch) {
      const runId = decodeURIComponent(evalMatch[1]);
      const body = await readJson(req);
      const authResult = await resolveRequestActor(body, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.runEvals)) {
        return json(res, 403, forbiddenResponse(actor, permissions.runEvals));
      }
      const tenant = resolveTenant(body, req.headers);
      if (!tenant.ok) {
        return json(res, tenant.status, { error: tenant.error, message: tenant.message });
      }
      const response = await updateState((state) => {
        const found = findRun(state, runId, tenant.tenantId);
        if (!found) {
          return null;
        }
        const run = rerunEvalPack(found.run);
        state.runs[found.index] = run;
        state.auditEvents.unshift({
          id: `audit-${Date.now().toString(36)}`,
          at: new Date().toISOString(),
          runId: run.id,
          event: `Eval pack rerun and stored by ${actor.name} as ${actor.role}.`,
        });
        return apiResponse(state, run);
      });
      if (!response) {
        return json(res, 404, { error: `run ${runId} not found` });
      }
      return json(res, 200, response);
    }

    const agentReviewMatch = pathname.match(/^\/api\/runs\/([^/]+)\/agent-review$/);
    if (req.method === "POST" && agentReviewMatch) {
      const runId = decodeURIComponent(agentReviewMatch[1]);
      const body = await readJson(req);
      const authResult = await resolveRequestActor(body, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.runAgentReview)) {
        return json(res, 403, forbiddenResponse(actor, permissions.runAgentReview));
      }
      const tenant = resolveTenant(body, req.headers);
      if (!tenant.ok) {
        return json(res, tenant.status, { error: tenant.error, message: tenant.message });
      }
      const response = await updateState(async (state) => {
        const found = findRun(state, runId, tenant.tenantId);
        if (!found) {
          return null;
        }
        const review = await runDeploymentReview(found.run);
        const reviewRecord = {
          id: `agent-review-${Date.now().toString(36)}`,
          runId: found.run.id,
          traceId: found.run.traceId,
          reviewedAt: new Date().toISOString(),
          ...review,
        };
        state.agentReviews.unshift(reviewRecord);
        state.runs[found.index] = {
          ...found.run,
          events: [`Agent review ${review.recommendation}: ${review.summary}`, ...found.run.events],
        };
        state.auditEvents.unshift({
          id: `audit-${Date.now().toString(36)}`,
          at: new Date().toISOString(),
          runId: found.run.id,
          event: `Agent review completed in ${review.mode} mode by ${actor.name} as ${actor.role}.`,
        });
        return apiResponse(state, state.runs[found.index]);
      });
      if (!response) {
        return json(res, 404, { error: `run ${runId} not found` });
      }
      return json(res, 200, response);
    }

    const auditMatch = pathname.match(/^\/api\/runs\/([^/]+)\/audit$/);
    if (req.method === "GET" && auditMatch) {
      const runId = decodeURIComponent(auditMatch[1]);
      const authResult = await resolveRequestActor({}, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.exportEvidence)) {
        return json(res, 403, forbiddenResponse(actor, permissions.exportEvidence));
      }
      const tenant = resolveTenant({}, req.headers);
      if (!tenant.ok) {
        return json(res, tenant.status, { error: tenant.error, message: tenant.message });
      }
      const state = await loadState();
      const found = findRun(state, runId, tenant.tenantId);
      if (!found) {
        return json(res, 404, { error: `run ${runId} not found` });
      }
      return json(res, 200, {
        runId,
        approvals: state.approvals.filter((approval) => approval.runId === runId),
        policyChecks: state.policyChecks.filter((check) => check.runId === runId),
        agentReviews: state.agentReviews.filter((review) => review.runId === runId),
        auditEvents: state.auditEvents.filter((event) => event.runId === runId),
      });
    }

    if (req.method === "GET" && pathname === "/api/billing/stripe-status") {
      return json(res, 200, stripeStatus());
    }

    if (req.method === "POST" && pathname === "/api/billing/stripe-webhook") {
      const posture = evaluateStripePosture();
      if (!posture.ok || !posture.enabled || posture.mode !== "test") {
        return json(res, 503, {
          error: "stripe_disabled",
          message: "Stripe webhooks require STRIPE_MODE=test (Grant hard lock: no live money).",
        });
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const signature = req.headers["stripe-signature"] || req.headers["Stripe-Signature"];
      const verified = verifyStripeWebhookSignature(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET || "");
      if (!verified.ok) {
        return json(res, 400, { error: verified.error, message: verified.message });
      }
      let event = null;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return json(res, 400, { error: "invalid_json", message: "Webhook body must be JSON." });
      }
      return json(res, 200, {
        received: true,
        mode: "test",
        liveAllowed: false,
        type: event?.type || null,
        verifiedAt: new Date().toISOString(),
      });
    }

    if (req.method === "GET" && pathname === "/api/audit/integrity") {
      const authResult = await resolveRequestActor({}, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.exportEvidence)) {
        return json(res, 403, forbiddenResponse(actor, permissions.exportEvidence));
      }
      const state = await loadState();
      return json(res, 200, {
        generatedAt: new Date().toISOString(),
        approvalLedger: verifyApprovalLedger(state.approvals),
        auditEventCount: state.auditEvents.length,
        runCount: state.runs.length,
      });
    }

    if (req.method === "GET" && pathname === "/api/audit/export") {
      const authResult = await resolveRequestActor({}, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.exportEvidence)) {
        return json(res, 403, forbiddenResponse(actor, permissions.exportEvidence));
      }
      const state = await loadState();
      return json(
        res,
        200,
        buildFullAuditExport(state, {
          service: "sentinelops-api",
          version: serviceVersion,
          storage: getStorageInfo(),
          authMode: authContext().mode,
          agentMode: getAgentRuntimeMode(),
        }),
      );
    }

    const evidenceManifestMatch = pathname.match(/^\/api\/runs\/([^/]+)\/evidence-manifest$/);
    if (req.method === "GET" && evidenceManifestMatch) {
      const runId = decodeURIComponent(evidenceManifestMatch[1]);
      const authResult = await resolveRequestActor({}, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.exportEvidence)) {
        return json(res, 403, forbiddenResponse(actor, permissions.exportEvidence));
      }
      const tenant = resolveTenant({}, req.headers);
      if (!tenant.ok) {
        return json(res, tenant.status, { error: tenant.error, message: tenant.message });
      }
      const state = await loadState();
      if (!findRun(state, runId, tenant.tenantId)) {
        return json(res, 404, { error: `run ${runId} not found` });
      }
      const manifest = buildEvidenceManifest(state, runId);
      if (!manifest) {
        return json(res, 404, { error: `run ${runId} not found` });
      }
      return json(res, 200, manifest);
    }

    const evidenceBundleMatch = pathname.match(/^\/api\/runs\/([^/]+)\/evidence-bundle$/);
    if (req.method === "GET" && evidenceBundleMatch) {
      const runId = decodeURIComponent(evidenceBundleMatch[1]);
      const authResult = await resolveRequestActor({}, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.exportEvidence)) {
        return json(res, 403, forbiddenResponse(actor, permissions.exportEvidence));
      }
      const tenant = resolveTenant({}, req.headers);
      if (!tenant.ok) {
        return json(res, tenant.status, { error: tenant.error, message: tenant.message });
      }
      const state = await loadState();
      if (!findRun(state, runId, tenant.tenantId)) {
        return json(res, 404, { error: `run ${runId} not found` });
      }
      const bundle = buildEvidenceBundle(state, runId);
      if (!bundle) {
        return json(res, 404, { error: `run ${runId} not found` });
      }
      await saveEvidencePacket(runId, bundle.evidencePacket);
      return json(res, 200, bundle);
    }

    const evidenceMatch = pathname.match(/^\/api\/runs\/([^/]+)\/evidence$/);
    if (req.method === "GET" && evidenceMatch) {
      const runId = decodeURIComponent(evidenceMatch[1]);
      const authResult = await resolveRequestActor({}, req.headers);
      if (!authResult.ok) {
        return json(res, authResult.status, unauthorizedResponse(authResult));
      }
      const actor = authResult.actor;
      if (!hasPermission(actor, permissions.exportEvidence)) {
        return json(res, 403, forbiddenResponse(actor, permissions.exportEvidence));
      }
      const tenant = resolveTenant({}, req.headers);
      if (!tenant.ok) {
        return json(res, tenant.status, { error: tenant.error, message: tenant.message });
      }
      const state = await loadState();
      const found = findRun(state, runId, tenant.tenantId);
      if (!found) {
        return json(res, 404, { error: `run ${runId} not found` });
      }
      const approvals = state.approvals.filter((approval) => approval.runId === runId);
      const policyChecks = state.policyChecks.filter((check) => check.runId === runId);
      const agentReviews = state.agentReviews.filter((review) => review.runId === runId);
      const packet = buildEvidencePacket(found.run, approvals, policyChecks, agentReviews);
      await saveEvidencePacket(runId, packet);
      return text(res, 200, packet, "text/markdown; charset=utf-8");
    }

    if (req.method === "GET") {
      const served = await serveStatic(pathname, res);
      if (served) return;
    }

    return json(res, 404, { error: "not found" });
  } catch (error) {
    const status = error.statusCode || 500;
    return json(res, status, error.safePayload || {
      error: error.message || (status === 500 ? "internal error" : "request failed"),
      stack: status === 500 && process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// GAGS AE-3: refuse to boot in a production-like environment without a real
// signing secret, so audit records are never signed with the public dev key.
const signingPosture = assertSigningPostureOrExit();
// GAGS IA / Aegis C1: refuse local-dev auth on non-loopback / production-like deploys.
const authPosture = assertAuthPostureOrExit();

server.listen(port, host, () => {
  console.log(
    `SentinelOps API listening on http://${host}:${port} (signatures: ${signingPosture.signatureMode}; auth: ${authPosture.mode})`,
  );
});
