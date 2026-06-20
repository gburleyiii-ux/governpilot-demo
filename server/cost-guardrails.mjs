import { buildModelGatewayStatus } from "./model-gateway.mjs";

const defaultPolicy = {
  policyVersion: "sentinelops-cost-guardrails/v1",
  defaultRunBudgetUsd: 0.5,
  dailyPilotBudgetUsd: 25,
  monthlyPilotBudgetUsd: 500,
  maxPilotRunsPerDay: 40,
  maxPromptTokens: 6000,
  maxCompletionTokens: 1800,
  maxTotalTokens: 7800,
  maxP95LatencyMs: 5500,
};

const estimatorProfiles = {
  "deterministic-local": {
    inputUsdPer1k: 0,
    outputUsdPer1k: 0,
    estimatedPromptTokens: 0,
    estimatedCompletionTokens: 0,
    estimatedP95LatencyMs: 180,
    estimatorNote: "Local deterministic reviewer has no external model spend.",
  },
  "openai-agents-sdk": {
    inputUsdPer1k: 0.0006,
    outputUsdPer1k: 0.0024,
    estimatedPromptTokens: 3600,
    estimatedCompletionTokens: 900,
    estimatedP95LatencyMs: 3200,
    estimatorNote: "Reviewer-defined portfolio estimate; replace with approved provider rate card before live use.",
  },
  "aws-bedrock-govcloud": {
    inputUsdPer1k: 0.0008,
    outputUsdPer1k: 0.0032,
    estimatedPromptTokens: 3800,
    estimatedCompletionTokens: 950,
    estimatedP95LatencyMs: 4200,
    estimatorNote: "Reviewer-defined GovCloud route estimate; replace with approved account billing data before live use.",
  },
};

function numberFromEnv(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function roundUsd(value) {
  return Math.round(value * 10000) / 10000;
}

function resolvePolicy(env) {
  return {
    ...defaultPolicy,
    defaultRunBudgetUsd: numberFromEnv(env, "SENTINELOPS_RUN_BUDGET_USD", defaultPolicy.defaultRunBudgetUsd),
    dailyPilotBudgetUsd: numberFromEnv(env, "SENTINELOPS_DAILY_PILOT_BUDGET_USD", defaultPolicy.dailyPilotBudgetUsd),
    monthlyPilotBudgetUsd: numberFromEnv(env, "SENTINELOPS_MONTHLY_PILOT_BUDGET_USD", defaultPolicy.monthlyPilotBudgetUsd),
    maxPilotRunsPerDay: numberFromEnv(env, "SENTINELOPS_MAX_PILOT_RUNS_PER_DAY", defaultPolicy.maxPilotRunsPerDay),
    maxPromptTokens: numberFromEnv(env, "SENTINELOPS_MAX_PROMPT_TOKENS", defaultPolicy.maxPromptTokens),
    maxCompletionTokens: numberFromEnv(env, "SENTINELOPS_MAX_COMPLETION_TOKENS", defaultPolicy.maxCompletionTokens),
    maxTotalTokens: numberFromEnv(env, "SENTINELOPS_MAX_TOTAL_TOKENS", defaultPolicy.maxTotalTokens),
    maxP95LatencyMs: numberFromEnv(env, "SENTINELOPS_MAX_P95_LATENCY_MS", defaultPolicy.maxP95LatencyMs),
  };
}

function resolveEstimator(env, routeId) {
  const profile = estimatorProfiles[routeId] || estimatorProfiles["deterministic-local"];
  const prefix = routeId.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return {
    ...profile,
    inputUsdPer1k: numberFromEnv(env, `SENTINELOPS_${prefix}_INPUT_USD_PER_1K`, profile.inputUsdPer1k),
    outputUsdPer1k: numberFromEnv(env, `SENTINELOPS_${prefix}_OUTPUT_USD_PER_1K`, profile.outputUsdPer1k),
    estimatedPromptTokens: numberFromEnv(env, `SENTINELOPS_${prefix}_PROMPT_TOKENS`, profile.estimatedPromptTokens),
    estimatedCompletionTokens: numberFromEnv(env, `SENTINELOPS_${prefix}_COMPLETION_TOKENS`, profile.estimatedCompletionTokens),
    estimatedP95LatencyMs: numberFromEnv(env, `SENTINELOPS_${prefix}_P95_LATENCY_MS`, profile.estimatedP95LatencyMs),
  };
}

function buildRouteBudget(provider, policy, env) {
  const estimator = resolveEstimator(env, provider.id);
  const estimatedCostUsd = roundUsd(
    (estimator.estimatedPromptTokens / 1000) * estimator.inputUsdPer1k +
      (estimator.estimatedCompletionTokens / 1000) * estimator.outputUsdPer1k,
  );
  const totalTokens = estimator.estimatedPromptTokens + estimator.estimatedCompletionTokens;
  const maxCostUsd = provider.id === "deterministic-local" ? 0 : policy.defaultRunBudgetUsd;
  const costStatus = estimatedCostUsd <= maxCostUsd ? "pass" : "review-required";
  const latencyLimitMs = Math.min(provider.maxLatencyMs, policy.maxP95LatencyMs);
  const latencyStatus = estimator.estimatedP95LatencyMs <= latencyLimitMs ? "pass" : "review-required";
  const tokenStatus =
    estimator.estimatedPromptTokens <= policy.maxPromptTokens &&
    estimator.estimatedCompletionTokens <= policy.maxCompletionTokens &&
    totalTokens <= policy.maxTotalTokens
      ? "pass"
      : "review-required";

  return {
    routeId: provider.id,
    provider: provider.provider,
    label: provider.label,
    configured: provider.configured,
    routeStatus: provider.status,
    estimatedCostUsd,
    maxCostUsd,
    costStatus,
    estimatedP95LatencyMs: estimator.estimatedP95LatencyMs,
    maxP95LatencyMs: latencyLimitMs,
    latencyStatus,
    estimatedPromptTokens: estimator.estimatedPromptTokens,
    estimatedCompletionTokens: estimator.estimatedCompletionTokens,
    estimatedTotalTokens: totalTokens,
    maxTotalTokens: policy.maxTotalTokens,
    tokenStatus,
    estimatorNote: estimator.estimatorNote,
    disclosureBoundary: "No prompts, completions, invoices, API keys, or raw provider telemetry are returned.",
  };
}

function buildControls(routeBudgets, policy, gatewayStatus, env) {
  const liveModeRequested = gatewayStatus.agentMode === "live";
  const liveBudgetApproved = env.SENTINELOPS_LIVE_BUDGET_APPROVED === "true";
  const projectedDailyUsd = roundUsd(
    Math.max(...routeBudgets.map((route) => route.estimatedCostUsd)) * policy.maxPilotRunsPerDay,
  );

  return [
    {
      id: "CBG-001",
      label: "Per-run spend stays inside reviewer budget",
      passed: routeBudgets.every((route) => route.costStatus === "pass"),
      evidence: `All route estimates must stay within $${policy.defaultRunBudgetUsd.toFixed(2)} per run.`,
    },
    {
      id: "CBG-002",
      label: "Daily pilot spend is bounded",
      passed: projectedDailyUsd <= policy.dailyPilotBudgetUsd,
      evidence: `Projected daily ceiling is $${projectedDailyUsd.toFixed(2)} for ${policy.maxPilotRunsPerDay} runs.`,
    },
    {
      id: "CBG-003",
      label: "Token envelope is enforced",
      passed: routeBudgets.every((route) => route.tokenStatus === "pass"),
      evidence: `Max token envelope is ${policy.maxTotalTokens} total tokens per review.`,
    },
    {
      id: "CBG-004",
      label: "Latency envelope is enforced",
      passed: routeBudgets.every((route) => route.latencyStatus === "pass"),
      evidence: `Route p95 latency must stay below ${policy.maxP95LatencyMs} ms and provider route limits.`,
    },
    {
      id: "CBG-005",
      label: "Live model budget approval gate",
      passed: !liveModeRequested || liveBudgetApproved,
      evidence: liveModeRequested
        ? "Live mode requires SENTINELOPS_LIVE_BUDGET_APPROVED=true before external inference."
        : "Live mode is not requested; deterministic fallback remains active.",
    },
    {
      id: "CBG-006",
      label: "Cost telemetry disclosure boundary",
      passed: true,
      evidence: "The API returns estimates and policy limits only, never prompts, completions, invoices, or secrets.",
    },
  ];
}

export function buildCostGuardrails({
  env = process.env,
  gatewayStatus = null,
  service = "sentinelops-api",
  version = "unknown",
  authMode = "unknown",
  agentMode = "deterministic-local",
  storage = null,
} = {}) {
  const gateway =
    gatewayStatus ||
    buildModelGatewayStatus({
      env,
      service,
      version,
      authMode,
      agentMode,
      storage,
    });
  const policy = resolvePolicy(env);
  const routeBudgets = gateway.providers.map((provider) => buildRouteBudget(provider, policy, env));
  const controls = buildControls(routeBudgets, policy, gateway, env);
  const passingControls = controls.filter((control) => control.passed).length;
  const preferredRouteBudget =
    routeBudgets.find((route) => route.routeId === gateway.preferredRouteId) || routeBudgets[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    service,
    version,
    guardrailVersion: policy.policyVersion,
    status: passingControls === controls.length ? "guarded" : "review-required",
    authMode,
    agentMode: gateway.agentMode,
    preferredRouteId: gateway.preferredRouteId,
    preferredRouteBudget,
    policy,
    counts: {
      routes: routeBudgets.length,
      passingControls,
      totalControls: controls.length,
      routesOverBudget: routeBudgets.filter((route) => route.costStatus !== "pass").length,
      routesOverLatency: routeBudgets.filter((route) => route.latencyStatus !== "pass").length,
      routesOverTokenLimit: routeBudgets.filter((route) => route.tokenStatus !== "pass").length,
    },
    routeBudgets,
    controls,
    disclosureBoundary: [
      "Estimator values are reviewer-defined policy inputs unless live billing integration is approved.",
      "No prompt, completion, invoice, account, API key, or raw provider telemetry is returned.",
      "Live mode requires a separate budget approval gate before external inference.",
    ],
  };
}
