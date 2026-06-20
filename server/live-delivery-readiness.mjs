import { listAlertRoutes } from "./alert-routing.mjs";

const providerDefinitions = [
  {
    id: "email-smtp",
    label: "SMTP Email Delivery",
    target: "email",
    requiredEnvVars: ["SENTINELOPS_SMTP_HOST", "SENTINELOPS_SMTP_FROM"],
    optionalEnvVars: ["SENTINELOPS_SMTP_PORT", "SENTINELOPS_SMTP_USERNAME", "SENTINELOPS_SMTP_PASSWORD"],
    destinationSummary: "SOC mailbox route configured through server-side SMTP settings.",
    credentialBoundary: "SMTP host, sender, username, and password stay server-side and are never returned.",
    payloadContract: "email-alert/v1",
  },
  {
    id: "slack-webhook",
    label: "Slack Governance Webhook",
    target: "slack",
    requiredEnvVars: ["SENTINELOPS_SLACK_WEBHOOK_URL"],
    optionalEnvVars: ["SENTINELOPS_SLACK_CHANNEL"],
    destinationSummary: "Governance channel route configured through a server-side webhook URL.",
    credentialBoundary: "Webhook URL and channel override stay server-side and are never returned.",
    payloadContract: "slack-alert/v1",
  },
  {
    id: "siem-ocsf",
    label: "SIEM OCSF Collector",
    target: "siem",
    requiredAnyEnvVars: ["SENTINELOPS_SIEM_HEC_URL", "SENTINELOPS_SIEM_ENDPOINT"],
    optionalEnvVars: ["SENTINELOPS_SIEM_HEC_TOKEN", "SENTINELOPS_SIEM_INDEX", "SENTINELOPS_SIEM_SOURCE"],
    destinationSummary: "SIEM collector route configured for OCSF-like governance alert events.",
    credentialBoundary: "Collector URL, HEC token, index, and source stay server-side and are never returned.",
    payloadContract: "ocsf-governance-alert/v1",
  },
  {
    id: "generic-webhook",
    label: "Generic Alert Webhook",
    target: "webhook",
    requiredEnvVars: ["SENTINELOPS_ALERT_WEBHOOK_URL"],
    optionalEnvVars: ["SENTINELOPS_ALERT_WEBHOOK_TOKEN"],
    destinationSummary: "Optional enterprise webhook route configured outside the default simulated routes.",
    credentialBoundary: "Webhook URL and bearer token stay server-side and are never returned.",
    payloadContract: "signed-alert-webhook/v1",
  },
];

const providerAliases = {
  email: "email-smtp",
  smtp: "email-smtp",
  "email-smtp": "email-smtp",
  slack: "slack-webhook",
  "slack-webhook": "slack-webhook",
  siem: "siem-ocsf",
  ocsf: "siem-ocsf",
  "siem-ocsf": "siem-ocsf",
  webhook: "generic-webhook",
  "generic-webhook": "generic-webhook",
};

function hasAll(env, names = []) {
  return names.every((name) => Boolean(env[name]));
}

function hasAny(env, names = []) {
  return names.some((name) => Boolean(env[name]));
}

function configuredEnvVars(env, names = []) {
  return names.filter((name) => Boolean(env[name]));
}

function resolveMode(env) {
  return env.SENTINELOPS_ALERT_DELIVERY_MODE || "simulated-local";
}

function resolveRequestedProviders(env, liveRequested) {
  if (!liveRequested) return [];
  const raw = env.SENTINELOPS_ALERT_LIVE_PROVIDERS || "email,slack,siem";
  const ids = raw
    .split(",")
    .map((value) => providerAliases[value.trim().toLowerCase()])
    .filter(Boolean);
  return [...new Set(ids.length ? ids : ["email-smtp", "slack-webhook", "siem-ocsf"])];
}

function buildProviders(env, requestedProviderIds) {
  return providerDefinitions.map((definition) => {
    const requiredConfigured = definition.requiredAnyEnvVars
      ? hasAny(env, definition.requiredAnyEnvVars)
      : hasAll(env, definition.requiredEnvVars);
    const requestedForLive = requestedProviderIds.includes(definition.id);
    const configured = Boolean(requiredConfigured);
    const status = configured ? "ready" : requestedForLive ? "config-required" : "not-configured";
    return {
      id: definition.id,
      label: definition.label,
      target: definition.target,
      requestedForLive,
      configured,
      status,
      requiredEnvVars: definition.requiredEnvVars || [],
      requiredAnyEnvVars: definition.requiredAnyEnvVars || [],
      optionalEnvVars: definition.optionalEnvVars,
      configuredEnvVars: configuredEnvVars(env, [
        ...(definition.requiredEnvVars || []),
        ...(definition.requiredAnyEnvVars || []),
        ...definition.optionalEnvVars,
      ]),
      destinationSummary: definition.destinationSummary,
      credentialBoundary: definition.credentialBoundary,
      payloadContract: definition.payloadContract,
    };
  });
}

function buildPayloadContracts() {
  return [
    {
      id: "signed-alert-dispatch/v1",
      fields: ["alertId", "routeId", "summaryHash", "previousHash", "signature"],
      boundary: "Dispatch records are HMAC signed and chain-linked before storage.",
    },
    {
      id: "ocsf-governance-alert/v1",
      fields: ["class_uid=600101", "severity", "observables", "event_hash"],
      boundary: "SIEM events preserve alert and run observables without exposing credentials.",
    },
    {
      id: "email-alert/v1",
      fields: ["subject", "severity", "latestRunId", "dashboardLink"],
      boundary: "Email payloads should contain operational metadata only, not raw prompts or regulated content.",
    },
    {
      id: "slack-alert/v1",
      fields: ["text", "severity", "routeId", "traceId"],
      boundary: "Slack payloads should summarize governance state and link back to approved evidence.",
    },
    {
      id: "signed-alert-webhook/v1",
      fields: ["dispatch", "siemEvent", "signature"],
      boundary: "Webhook payloads are server-to-server only and reuse the signed dispatch contract.",
    },
  ];
}

function buildControls({ liveRequested, liveApproved, requestedProviders, providers, simulatedRoutes }) {
  const requestedProviderSet = new Set(requestedProviders);
  const requestedLiveProviders = providers.filter((provider) => requestedProviderSet.has(provider.id));
  const requestedProvidersConfigured = requestedLiveProviders.every((provider) => provider.configured);
  const siemRouteAvailable = simulatedRoutes.some((route) => route.target === "siem" && route.enabled);

  return [
    {
      id: "LDR-001",
      label: "Simulated alert fallback is available",
      passed: simulatedRoutes.some((route) => route.enabled),
      evidence: `${simulatedRoutes.filter((route) => route.enabled).length} local dispatch route(s) remain available.`,
    },
    {
      id: "LDR-002",
      label: "Signed dispatch ledger remains authoritative",
      passed: true,
      evidence: "Live delivery readiness does not bypass routeObservabilityAlerts or dispatch signature verification.",
    },
    {
      id: "LDR-003",
      label: "Live delivery approval gate",
      passed: !liveRequested || liveApproved,
      evidence: liveRequested
        ? "Live delivery requires SENTINELOPS_LIVE_DELIVERY_APPROVED=true."
        : "Live delivery is not requested; simulated local mode remains active.",
    },
    {
      id: "LDR-004",
      label: "Requested live providers are configured",
      passed: !liveRequested || requestedProvidersConfigured,
      evidence: liveRequested
        ? `${requestedLiveProviders.filter((provider) => provider.configured).length}/${requestedLiveProviders.length} requested provider(s) configured.`
        : "No live provider delivery is requested.",
    },
    {
      id: "LDR-005",
      label: "No live credential values are disclosed",
      passed: true,
      evidence: "The API returns provider booleans and environment-variable names only.",
    },
    {
      id: "LDR-006",
      label: "SIEM OCSF payload contract is declared",
      passed: siemRouteAvailable,
      evidence: siemRouteAvailable
        ? "OCSF-like class_uid 600101 remains available for SIEM preview and live collector mapping."
        : "No enabled SIEM route exists in the alert catalog.",
    },
    {
      id: "LDR-007",
      label: "Unapproved live mode fails closed",
      passed: !liveRequested || liveApproved,
      evidence: "Missing approval keeps the readiness status at review-required instead of attempting external delivery.",
    },
  ];
}

export function buildLiveDeliveryReadiness({
  env = process.env,
  service = "sentinelops-api",
  version = "unknown",
  authMode = "unknown",
  agentMode = "deterministic-local",
  storage = null,
} = {}) {
  const mode = resolveMode(env);
  const liveRequested = mode === "live";
  const liveApproved = env.SENTINELOPS_LIVE_DELIVERY_APPROVED === "true";
  const requestedProviders = resolveRequestedProviders(env, liveRequested);
  const providers = buildProviders(env, requestedProviders);
  const simulatedRoutes = listAlertRoutes();
  const controls = buildControls({
    liveRequested,
    liveApproved,
    requestedProviders,
    providers,
    simulatedRoutes,
  });
  const passingControls = controls.filter((control) => control.passed).length;
  const requestedProviderSet = new Set(requestedProviders);
  const requestedLiveProviders = providers.filter((provider) => requestedProviderSet.has(provider.id));
  const requestedProvidersConfigured = requestedLiveProviders.every((provider) => provider.configured);
  const status = liveRequested
    ? liveApproved && requestedProvidersConfigured
      ? "live-ready"
      : "review-required"
    : "simulated-ready";

  return {
    generatedAt: new Date().toISOString(),
    service,
    version,
    readinessVersion: "sentinelops-live-delivery-readiness/v1",
    status,
    mode,
    liveRequested,
    liveApproved,
    authMode,
    agentMode,
    storageMode: storage?.mode || "unknown",
    counts: {
      providers: providers.length,
      configuredProviders: providers.filter((provider) => provider.configured).length,
      requestedProviders: requestedLiveProviders.length,
      readyRequestedProviders: requestedLiveProviders.filter((provider) => provider.configured).length,
      simulatedRoutes: simulatedRoutes.length,
      passingControls,
      totalControls: controls.length,
    },
    routes: simulatedRoutes.map((route) => ({
      id: route.id,
      label: route.label,
      target: route.target,
      deliveryMode: route.deliveryMode,
      severities: route.severities,
      enabled: route.enabled,
    })),
    providers,
    controls,
    payloadContracts: buildPayloadContracts(),
    disclosureBoundary: [
      "Live provider credentials, webhook URLs, SMTP passwords, and SIEM tokens are never returned.",
      "Readiness can be proven without sending email, Slack, webhook, or SIEM traffic.",
      "Simulated signed dispatch remains the default until live delivery is explicitly approved.",
      "Live delivery should carry governance metadata and evidence links, not raw prompts or regulated payloads.",
    ],
  };
}
