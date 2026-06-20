import { buildLiveDeliveryReadiness } from "../server/live-delivery-readiness.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includesRawValue(value, raw) {
  return JSON.stringify(value).includes(raw);
}

const simulatedReadiness = buildLiveDeliveryReadiness({
  version: "0.22.0",
  authMode: "local-dev",
  agentMode: "deterministic-local",
  storage: { mode: "local-json" },
  env: {},
});

assert(simulatedReadiness.status === "simulated-ready", `expected simulated-ready, received ${simulatedReadiness.status}`);
assert(
  simulatedReadiness.readinessVersion === "sentinelops-live-delivery-readiness/v1",
  "expected live delivery readiness version",
);
assert(simulatedReadiness.routes.length === 3, "expected default simulated email, Slack, and SIEM routes");
assert(simulatedReadiness.counts.providers === 4, "expected email, Slack, SIEM, and webhook providers");
assert(simulatedReadiness.counts.passingControls === simulatedReadiness.counts.totalControls, "expected simulated controls to pass");
assert(
  simulatedReadiness.payloadContracts.some((contract) => contract.id === "ocsf-governance-alert/v1"),
  "expected SIEM payload contract",
);

const liveReady = buildLiveDeliveryReadiness({
  version: "0.22.0",
  authMode: "oidc",
  agentMode: "live",
  storage: { mode: "aws-s3-dynamodb" },
  env: {
    SENTINELOPS_ALERT_DELIVERY_MODE: "live",
    SENTINELOPS_LIVE_DELIVERY_APPROVED: "true",
    SENTINELOPS_ALERT_LIVE_PROVIDERS: "email,slack,siem,webhook",
    SENTINELOPS_SMTP_HOST: "smtp.example.internal",
    SENTINELOPS_SMTP_FROM: "sentinelops@example.internal",
    SENTINELOPS_SMTP_PASSWORD: "smtp-password-value",
    SENTINELOPS_SLACK_WEBHOOK_URL: "https://hooks.slack.test/sentinelops-secret",
    SENTINELOPS_SIEM_HEC_URL: "https://siem.example.internal/services/collector",
    SENTINELOPS_SIEM_HEC_TOKEN: "siem-token-value",
    SENTINELOPS_ALERT_WEBHOOK_URL: "https://webhook.example.internal/alert-secret",
    SENTINELOPS_ALERT_WEBHOOK_TOKEN: "webhook-token-value",
  },
});

assert(liveReady.status === "live-ready", `expected live-ready, received ${liveReady.status}`);
assert(liveReady.counts.requestedProviders === 4, "expected all four providers requested");
assert(liveReady.counts.readyRequestedProviders === 4, "expected all requested providers ready");
assert(liveReady.controls.every((control) => control.passed), "expected live-ready controls to pass");
assert(liveReady.providers.every((provider) => provider.status === "ready"), "expected providers to be ready");
assert(!includesRawValue(liveReady, "smtp-password-value"), "expected SMTP password non-disclosure");
assert(!includesRawValue(liveReady, "https://hooks.slack.test"), "expected Slack webhook URL non-disclosure");
assert(!includesRawValue(liveReady, "siem-token-value"), "expected SIEM token non-disclosure");
assert(!includesRawValue(liveReady, "alert-secret"), "expected generic webhook URL non-disclosure");
assert(!includesRawValue(liveReady, "webhook-token-value"), "expected generic webhook token non-disclosure");

const liveMissingApproval = buildLiveDeliveryReadiness({
  version: "0.22.0",
  authMode: "jwt",
  agentMode: "live",
  storage: { mode: "local-json" },
  env: {
    SENTINELOPS_ALERT_DELIVERY_MODE: "live",
    SENTINELOPS_ALERT_LIVE_PROVIDERS: "email,slack,siem",
    SENTINELOPS_SMTP_HOST: "smtp.example.internal",
  },
});

assert(liveMissingApproval.status === "review-required", "expected live delivery without approval/config to require review");
assert(
  liveMissingApproval.controls.some((control) => control.id === "LDR-003" && !control.passed),
  "expected live delivery approval gate to fail",
);
assert(
  liveMissingApproval.controls.some((control) => control.id === "LDR-004" && !control.passed),
  "expected requested provider config control to fail",
);
assert(
  liveMissingApproval.providers.some((provider) => provider.id === "slack-webhook" && provider.status === "config-required"),
  "expected Slack provider config requirement",
);

console.log(
  JSON.stringify(
    {
      simulatedStatus: simulatedReadiness.status,
      liveStatus: liveReady.status,
      reviewRequiredStatus: liveMissingApproval.status,
      providerCount: simulatedReadiness.counts.providers,
      routeCount: simulatedReadiness.counts.simulatedRoutes,
      liveControls: `${liveReady.counts.passingControls}/${liveReady.counts.totalControls}`,
      noSlackWebhookDisclosure: !includesRawValue(liveReady, "https://hooks.slack.test"),
      noSiemTokenDisclosure: !includesRawValue(liveReady, "siem-token-value"),
      noWebhookTokenDisclosure: !includesRawValue(liveReady, "webhook-token-value"),
    },
    null,
    2,
  ),
);
