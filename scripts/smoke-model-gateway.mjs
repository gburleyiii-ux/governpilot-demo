import { buildModelGatewayStatus } from "../server/model-gateway.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const localStatus = buildModelGatewayStatus({
  version: "0.22.0",
  authMode: "local-dev",
  agentMode: "deterministic-local",
  storage: { mode: "local-json" },
  env: {},
});

assert(localStatus.status === "deterministic-ready", "expected deterministic-ready without live credentials");
assert(localStatus.providers.length === 3, "expected three provider routes");
assert(localStatus.preferredRouteId === "deterministic-local", "expected local fallback preferred route");
assert(localStatus.counts.passingControls === localStatus.counts.totalControls, "expected local controls to pass");
assert(localStatus.controlChecks.some((check) => check.id === "MGW-001" && check.passed), "expected secret boundary control");
assert(!JSON.stringify(localStatus).includes("sk-test-secret"), "expected no raw secret value in gateway status");

const liveOpenAiStatus = buildModelGatewayStatus({
  version: "0.22.0",
  authMode: "jwt",
  agentMode: "live",
  storage: { mode: "aws-s3-dynamodb" },
  env: {
    OPENAI_API_KEY: "sk-test-secret",
    AWS_REGION: "us-east-1",
  },
});

assert(liveOpenAiStatus.status === "live-ready", "expected live-ready with OpenAI credential");
assert(liveOpenAiStatus.preferredRouteId === "openai-agents-sdk", "expected OpenAI route when Bedrock GovCloud is unavailable");
assert(liveOpenAiStatus.counts.configuredLiveProviders === 1, "expected one configured live provider");
assert(!JSON.stringify(liveOpenAiStatus).includes("sk-test-secret"), "expected OpenAI secret value to be redacted");

const govCloudStatus = buildModelGatewayStatus({
  version: "0.22.0",
  authMode: "oidc",
  agentMode: "live",
  storage: { mode: "aws-s3-dynamodb" },
  env: {
    OPENAI_API_KEY: "sk-test-secret",
    SENTINELOPS_AWS_REGION: "us-gov-west-1",
    AWS_WEB_IDENTITY_TOKEN_FILE: "/var/run/secrets/token",
  },
});

assert(govCloudStatus.status === "live-ready", "expected live-ready with GovCloud workload identity");
assert(govCloudStatus.preferredRouteId === "aws-bedrock-govcloud", "expected GovCloud Bedrock to be preferred when configured");
assert(govCloudStatus.controlChecks.every((check) => check.passed), "expected GovCloud controls to pass");
assert(govCloudStatus.securityBoundary.some((item) => item.includes("GovCloud")), "expected GovCloud security boundary");

console.log(
  JSON.stringify(
    {
      localStatus: localStatus.status,
      localPreferredRoute: localStatus.preferredRouteId,
      liveOpenAiStatus: liveOpenAiStatus.status,
      liveOpenAiPreferredRoute: liveOpenAiStatus.preferredRouteId,
      govCloudStatus: govCloudStatus.status,
      govCloudPreferredRoute: govCloudStatus.preferredRouteId,
      providerCount: localStatus.providers.length,
      controlCount: localStatus.counts.totalControls,
      noSecretDisclosure: !JSON.stringify(liveOpenAiStatus).includes("sk-test-secret"),
    },
    null,
    2,
  ),
);
