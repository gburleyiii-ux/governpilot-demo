function hasAny(env, names) {
  return names.some((name) => Boolean(env[name]));
}

function providerStatus(configured, fallback) {
  if (configured) return "ready";
  return fallback ? "fallback-ready" : "credential-required";
}

export function buildModelGatewayStatus({
  env = process.env,
  service = "sentinelops-api",
  version = "unknown",
  authMode = "unknown",
  agentMode = "deterministic-local",
  storage = null,
} = {}) {
  const openaiConfigured = Boolean(env.OPENAI_API_KEY);
  const bedrockConfigured =
    Boolean(env.AWS_REGION || env.SENTINELOPS_AWS_REGION) &&
    hasAny(env, ["AWS_ACCESS_KEY_ID", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_WEB_IDENTITY_TOKEN_FILE"]);
  const bedrockRegion = env.SENTINELOPS_AWS_REGION || env.AWS_REGION || "us-gov-west-1";
  const bedrockGovCloudAligned = bedrockRegion.startsWith("us-gov-");

  const providers = [
    {
      id: "deterministic-local",
      label: "Deterministic Local Reviewer",
      provider: "local",
      configured: true,
      status: "ready",
      credentialBoundary: "No external model credential required.",
      credentialEnvVars: [],
      regionPolicy: "Local process only",
      dataBoundary: "Portfolio demo data remains local.",
      allowedUse: ["stable demos", "local evals", "offline governance review"],
      blockedUse: ["production autonomous decisions"],
      maxLatencyMs: 250,
      costCeiling: "$0 per run",
      fallbackPriority: 1,
    },
    {
      id: "openai-agents-sdk",
      label: "OpenAI Agents SDK",
      provider: "openai",
      configured: openaiConfigured,
      status: providerStatus(openaiConfigured, false),
      credentialBoundary: "Requires OPENAI_API_KEY and live mode; secret value is never returned by the API.",
      credentialEnvVars: ["OPENAI_API_KEY", "SENTINELOPS_AGENT_MODE=live"],
      regionPolicy: "Commercial endpoint unless routed through an approved enterprise gateway.",
      dataBoundary: "Only approved, nonclassified pilot payloads may be sent.",
      allowedUse: ["controlled pilot review", "agent review generation", "eval comparison"],
      blockedUse: ["classified data", "unapproved PII/PHI payloads", "direct browser-side model calls"],
      maxLatencyMs: 4500,
      costCeiling: "reviewer-approved budget envelope",
      fallbackPriority: 2,
    },
    {
      id: "aws-bedrock-govcloud",
      label: "AWS Bedrock GovCloud Route",
      provider: "bedrock",
      configured: bedrockConfigured && bedrockGovCloudAligned,
      status: providerStatus(bedrockConfigured && bedrockGovCloudAligned, false),
      credentialBoundary: "Requires approved AWS workload identity and GovCloud region; access keys are never returned by the API.",
      credentialEnvVars: [
        "SENTINELOPS_AWS_REGION or AWS_REGION",
        "AWS_ACCESS_KEY_ID or task role or web identity",
        "SENTINELOPS_AGENT_MODE=live",
      ],
      regionPolicy: bedrockGovCloudAligned ? `${bedrockRegion} GovCloud aligned` : `${bedrockRegion} is not GovCloud aligned`,
      dataBoundary: "GovCloud-only route for approved controlled-pilot payloads.",
      allowedUse: ["GovCloud pilot routing", "enterprise model gateway fallback", "regulated workload comparison"],
      blockedUse: ["commercial-region regulated payloads", "missing IAM boundary", "unreviewed model changes"],
      maxLatencyMs: 5500,
      costCeiling: "account-level Bedrock budget alarm required",
      fallbackPriority: 3,
    },
  ];

  const configuredLiveProviders = providers.filter((provider) => provider.provider !== "local" && provider.configured);
  const preferredRoute =
    configuredLiveProviders.find((provider) => provider.id === "aws-bedrock-govcloud") ||
    configuredLiveProviders.find((provider) => provider.id === "openai-agents-sdk") ||
    providers[0];
  const liveModeRequested = agentMode === "live";
  const status = configuredLiveProviders.length > 0 ? "live-ready" : liveModeRequested ? "credential-required" : "deterministic-ready";

  const routingPlan = [
    {
      id: "route-local-default",
      condition: "SENTINELOPS_AGENT_MODE is unset or deterministic-local",
      routeId: "deterministic-local",
      decision: "Use deterministic local reviewer for stable demos, evals, and offline portfolio review.",
    },
    {
      id: "route-openai-live",
      condition: "SENTINELOPS_AGENT_MODE=live and OPENAI_API_KEY is present",
      routeId: "openai-agents-sdk",
      decision: "Use OpenAI Agents SDK behind the server boundary; never call models from the browser.",
    },
    {
      id: "route-bedrock-govcloud",
      condition: "GovCloud region and AWS workload identity are configured",
      routeId: "aws-bedrock-govcloud",
      decision: "Route regulated pilot payloads through the GovCloud Bedrock path after reviewer approval.",
    },
    {
      id: "route-fallback",
      condition: "Live credentials are absent or policy checks fail",
      routeId: "deterministic-local",
      decision: "Fall back to local deterministic mode and preserve an audit event instead of attempting external inference.",
    },
  ];

  const controlChecks = [
    {
      id: "MGW-001",
      label: "No model secrets in API responses",
      passed: true,
      evidence: "Gateway returns booleans and environment-variable names only.",
    },
    {
      id: "MGW-002",
      label: "Server-side model boundary",
      passed: true,
      evidence: "Browser talks only to SentinelOps API; provider calls remain server-owned.",
    },
    {
      id: "MGW-003",
      label: "Deterministic fallback route",
      passed: providers[0].configured,
      evidence: "Local reviewer remains available when live credentials are missing.",
    },
    {
      id: "MGW-004",
      label: "GovCloud region guard",
      passed: bedrockGovCloudAligned,
      evidence: `Bedrock route region policy: ${bedrockRegion}.`,
    },
    {
      id: "MGW-005",
      label: "Live mode credential gate",
      passed: !liveModeRequested || configuredLiveProviders.length > 0,
      evidence: liveModeRequested
        ? `${configuredLiveProviders.length} live provider route(s) configured.`
        : "Live mode is not requested; external inference stays disabled.",
    },
    {
      id: "MGW-006",
      label: "Cost and latency envelope declared",
      passed: providers.every((provider) => provider.maxLatencyMs > 0 && provider.costCeiling),
      evidence: "Each provider route declares max latency and cost guardrail expectations.",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    service,
    version,
    status,
    authMode,
    agentMode,
    storageMode: storage?.mode || "unknown",
    preferredRouteId: preferredRoute.id,
    counts: {
      providers: providers.length,
      readyProviders: providers.filter((provider) => provider.status === "ready").length,
      configuredLiveProviders: configuredLiveProviders.length,
      blockedProviders: providers.filter((provider) => provider.status === "credential-required").length,
      routingRules: routingPlan.length,
      passingControls: controlChecks.filter((check) => check.passed).length,
      totalControls: controlChecks.length,
    },
    providers,
    routingPlan,
    controlChecks,
    securityBoundary: [
      "No provider keys are returned to the dashboard.",
      "Live model calls must stay behind the SentinelOps API boundary.",
      "Reviewer approval, eval health, and policy-as-code checks remain upstream of external inference.",
      "GovCloud payload routing requires GovCloud region alignment and approved workload identity.",
      "Missing credentials trigger deterministic fallback instead of unreviewed external calls.",
    ],
  };
}
