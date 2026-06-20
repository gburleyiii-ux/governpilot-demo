import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { signLocalJwt } from "../server/auth.mjs";

const port = Number(process.env.SENTINELOPS_AUTH_SMOKE_PORT || 4185);
const baseUrl = `http://127.0.0.1:${port}/api`;
const secret = "sentinelops-auth-smoke-secret";
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function token(claims) {
  const now = Math.floor(Date.now() / 1000);
  return signLocalJwt(
    {
      iss: "sentinelops-auth-smoke",
      aud: "sentinelops-api",
      iat: now,
      nbf: now - 5,
      exp: now + 300,
      ...claims,
    },
    secret,
  );
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";
  return {
    status: response.status,
    body: contentType.includes("json") && raw ? JSON.parse(raw) : raw,
  };
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const health = await request("/health");
      if (health.status === 200) return health.body;
    } catch {
      // Server not ready yet.
    }
    await delay(250);
  }
  throw new Error("JWT auth smoke server did not become healthy.");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const server = spawn(process.execPath, ["server/index.mjs"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: "production",
    SENTINELOPS_SIGNING_SECRET: "sentinelops-auth-smoke-signing-secret",
    SENTINELOPS_API_HOST: "127.0.0.1",
    SENTINELOPS_API_PORT: String(port),
    SENTINELOPS_AUTH_MODE: "jwt",
    SENTINELOPS_AUTH_JWT_SECRET: secret,
    SENTINELOPS_AUTH_ISSUER: "sentinelops-auth-smoke",
    SENTINELOPS_AUTH_AUDIENCE: "sentinelops-api",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const logs = [];
server.stdout.on("data", (chunk) => logs.push(chunk.toString()));
server.stderr.on("data", (chunk) => logs.push(chunk.toString()));

try {
  const health = await waitForHealth();
  assert(health.authMode === "jwt", `expected jwt auth mode, received ${health.authMode}`);

  const securityToken = token({
    sub: "security-1",
    email: "grant@example.test",
    name: "Grant Burley III",
    groups: ["sentinelops-security-reviewers"],
  });

  const anonymousCreate = await request("/runs", { method: "POST", body: "{}" });
  assert(anonymousCreate.status === 401, `expected anonymous run creation to return 401, received ${anonymousCreate.status}`);

  const created = await request("/runs", { method: "POST", token: securityToken, body: "{}" });
  assert(created.status === 201, `expected token-authenticated run creation to return 201, received ${created.status}`);
  const runId = created.body.run.id;

  const missingToken = await request(`/runs/${runId}/approval`, {
    method: "POST",
    body: JSON.stringify({ state: "approved" }),
  });
  assert(missingToken.status === 401, `expected missing token to return 401, received ${missingToken.status}`);

  const auditorToken = token({
    sub: "auditor-1",
    email: "auditor@example.test",
    name: "Audit Reviewer",
    groups: ["sentinelops-auditors"],
  });
  const auditorApproval = await request(`/runs/${runId}/approval`, {
    method: "POST",
    token: auditorToken,
    body: JSON.stringify({ state: "approved" }),
  });
  assert(auditorApproval.status === 403, `expected auditor approval to be blocked, received ${auditorApproval.status}`);

  const securityApproval = await request(`/runs/${runId}/approval`, {
    method: "POST",
    token: securityToken,
    body: JSON.stringify({ state: "approved" }),
  });
  assert(securityApproval.status === 200, `expected security reviewer approval to pass, received ${securityApproval.status}`);
  assert(securityApproval.body.latestApproval.reviewerRole === "security-reviewer", "expected token group to map to security-reviewer");
  assert(securityApproval.body.latestApproval.reviewer === "Grant Burley III", "expected reviewer name from token claims");

  console.log(
    JSON.stringify(
      {
        authMode: health.authMode,
        runId,
        anonymousCreateBlocked: anonymousCreate.status === 401,
        missingTokenBlocked: missingToken.status === 401,
        auditorApprovalBlocked: auditorApproval.status === 403,
        securityReviewerApproved: securityApproval.status === 200,
        approvalRole: securityApproval.body.latestApproval.reviewerRole,
      },
      null,
      2,
    ),
  );
} finally {
  server.kill("SIGTERM");
  await delay(100);
}
