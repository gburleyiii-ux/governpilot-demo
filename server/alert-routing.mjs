import { createHash, createHmac } from "node:crypto";
import { resolveSigningSecret, signatureModeFor } from "./signing-guard.mjs";

const routeCatalog = [
  {
    id: "soc-email",
    label: "SOC Email",
    target: "email",
    destination: "soc-alerts@example.internal",
    severities: ["critical", "high"],
    deliveryMode: "simulated-local",
    enabled: true,
  },
  {
    id: "governance-slack",
    label: "AI Governance Slack",
    target: "slack",
    destination: "#ai-governance",
    severities: ["critical", "high", "medium"],
    deliveryMode: "simulated-local",
    enabled: true,
  },
  {
    id: "siem-ocsf",
    label: "SIEM OCSF Export",
    target: "siem",
    destination: "ocsf://sentinelops/ai-governance",
    severities: ["critical", "high", "medium", "info"],
    deliveryMode: "simulated-local",
    enabled: true,
  },
];

function signingSecret() {
  return resolveSigningSecret();
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function signDispatchPayload(payload, previousHash) {
  return createHmac("sha256", signingSecret())
    .update(JSON.stringify({ payload, previousHash }))
    .digest("hex");
}

function severityRank(severity) {
  return {
    info: 1,
    medium: 3,
    high: 4,
    critical: 5,
  }[severity] || 2;
}

function destinationRoutes(alert) {
  return routeCatalog.filter((route) => route.enabled && route.severities.includes(alert.severity));
}

export function listAlertRoutes() {
  return routeCatalog.map((route) => ({
    ...route,
    severities: [...route.severities],
  }));
}

export function buildSiemEvent(alert, summary, route) {
  const event = {
    activity_id: 1,
    activity_name: "Governance Alert Routed",
    category_name: "Application Activity",
    class_name: "SentinelOps AI Governance Alert",
    class_uid: 600101,
    severity: alert.severity,
    severity_id: severityRank(alert.severity),
    time: summary.generatedAt,
    metadata: {
      product: {
        name: summary.service,
        version: summary.version,
      },
      version: "1.2.0",
    },
    observables: [
      {
        name: "latest_run_id",
        value: summary.latestRunId || "none",
      },
      {
        name: "alert_id",
        value: alert.id,
      },
    ],
    actor: {
      user: {
        name: "SentinelOps AI",
      },
    },
    message: `${alert.title}: ${alert.detail}`,
    unmapped: {
      alert,
      routeId: route.id,
      target: route.target,
      authMode: summary.authMode,
      agentMode: summary.agentMode,
      sloSnapshot: summary.slos.map((slo) => ({
        id: slo.id,
        status: slo.status,
        actual: slo.actual,
        target: slo.target,
      })),
    },
  };
  return {
    ...event,
    event_hash: sha256(canonicalJson(event)),
  };
}

export function routeObservabilityAlerts(summary, actor, previousHash = null, options = {}) {
  const alerts = summary.alerts || [];
  const dispatches = [];
  const deliveryMode = options.deliveryMode || "simulated-local";
  const deliveryStatus = options.deliveryStatus || "simulated";
  for (const alert of alerts) {
    for (const route of destinationRoutes(alert)) {
      const payload = {
        id: `dispatch-${Date.now().toString(36)}-${dispatches.length + 1}`,
        routedAt: new Date().toISOString(),
        alertId: alert.id,
        alertTitle: alert.title,
        alertSeverity: alert.severity,
        runId: summary.latestRunId,
        routeId: route.id,
        routeLabel: route.label,
        target: route.target,
        destination: route.destination,
        deliveryMode,
        deliveryStatus,
        actorName: actor.name,
        actorRole: actor.role,
        signingMode: signatureModeFor(),
        summaryHash: sha256(canonicalJson({
          generatedAt: summary.generatedAt,
          latestRunId: summary.latestRunId,
          alerts: summary.alerts,
          slos: summary.slos,
          counts: summary.counts,
        })),
        siemEvent: buildSiemEvent(alert, summary, route),
        previousHash,
      };
      const signature = signDispatchPayload(payload, previousHash);
      dispatches.push({
        ...payload,
        signature,
      });
      previousHash = signature;
    }
  }
  const newestFirstDispatches = [...dispatches].reverse();
  return {
    routes: listAlertRoutes(),
    dispatches: newestFirstDispatches,
    siemEvents: newestFirstDispatches.filter((dispatch) => dispatch.target === "siem").map((dispatch) => dispatch.siemEvent),
  };
}

export function verifyAlertDispatch(dispatch) {
  const { signature, ...payload } = dispatch;
  return {
    id: dispatch.id,
    alertId: dispatch.alertId,
    routeId: dispatch.routeId,
    target: dispatch.target,
    signature,
    signatureValid: signature === signDispatchPayload(payload, dispatch.previousHash || null),
  };
}

export function verifyAlertDispatchLedger(dispatches = []) {
  const checks = dispatches.map((dispatch, index) => {
    const signatureCheck = verifyAlertDispatch(dispatch);
    const expectedPreviousHash = dispatches[index + 1]?.signature || null;
    return {
      ...signatureCheck,
      chainLinkValid: (dispatch.previousHash || null) === expectedPreviousHash,
      expectedPreviousHash,
    };
  });
  return {
    total: dispatches.length,
    validSignatures: checks.filter((check) => check.signatureValid).length,
    validChainLinks: checks.filter((check) => check.chainLinkValid).length,
    passed: checks.every((check) => check.signatureValid && check.chainLinkValid),
    checks,
  };
}
