import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { signLocalRs256Jwt } from "../server/auth.mjs";

const apiPort = Number(process.env.SENTINELOPS_OIDC_SMOKE_API_PORT || 4186);
const jwksPort = Number(process.env.SENTINELOPS_OIDC_SMOKE_JWKS_PORT || 4187);
const issuer = "sentinelops-oidc-smoke";
const audience = "sentinelops-api";
const kid = "sentinelops-oidc-smoke-rsa-1";
const baseUrl = `http://127.0.0.1:${apiPort}/api`;
const jwksUrl = `http://127.0.0.1:${jwksPort}/.well-known/jwks.json`;
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const publicJwk = {
  ...publicKey.export({ format: "jwk" }),
  kid,
  use: "sig",
  alg: "RS256",
};

function token(claims, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  return signLocalRs256Jwt(
    {
      iss: issuer,
      aud: audience,
      iat: now,
      nbf: now - 5,
      exp: now + 300,
      ...claims,
    },
    privateKey,
    { kid: options.kid || kid },
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
      // API not ready yet.
    }
    await delay(250);
  }
  throw new Error("OIDC auth smoke server did not become healthy.");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const jwksServer = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/.well-known/jwks.json") {
    const body = JSON.stringify({ keys: [publicJwk] });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    });
    res.end(body);
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "not_found" }));
});

await new Promise((resolve, reject) => {
  jwksServer.once("error", reject);
  jwksServer.listen(jwksPort, "127.0.0.1", resolve);
});

const apiServer = spawn(process.execPath, ["server/index.mjs"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: "production",
    SENTINELOPS_SIGNING_SECRET: "sentinelops-oidc-smoke-signing-secret",
    SENTINELOPS_API_HOST: "127.0.0.1",
    SENTINELOPS_API_PORT: String(apiPort),
    SENTINELOPS_AUTH_MODE: "oidc",
    SENTINELOPS_AUTH_JWKS_URL: jwksUrl,
    SENTINELOPS_AUTH_ISSUER: issuer,
    SENTINELOPS_AUTH_AUDIENCE: audience,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const logs = [];
apiServer.stdout.on("data", (chunk) => logs.push(chunk.toString()));
apiServer.stderr.on("data", (chunk) => logs.push(chunk.toString()));

try {
  const health = await waitForHealth();
  assert(health.authMode === "oidc", `expected oidc auth mode, received ${health.authMode}`);

  const context = await request("/auth/context");
  assert(context.status === 200, `expected auth context to return 200, received ${context.status}`);
  assert(context.body.auth.oidc.algorithm === "RS256", "expected OIDC context to advertise RS256");
  assert(context.body.auth.oidc.jwksConfigured === true, "expected OIDC context to show JWKS configured");

  const securityToken = token({
    sub: "security-oidc-1",
    email: "grant@example.test",
    name: "Grant Burley III",
    groups: ["sentinelops-security-reviewers"],
  });

  const anonymousCreate = await request("/runs", { method: "POST", body: "{}" });
  assert(anonymousCreate.status === 401, `expected anonymous run creation to return 401, received ${anonymousCreate.status}`);

  const unknownKid = await request("/runs", {
    method: "POST",
    token: token({ sub: "bad-kid", groups: ["sentinelops-security-reviewers"] }, { kid: "unknown-kid" }),
    body: "{}",
  });
  assert(unknownKid.status === 401, `expected unknown kid token to return 401, received ${unknownKid.status}`);

  const created = await request("/runs", { method: "POST", token: securityToken, body: "{}" });
  assert(created.status === 201, `expected OIDC-authenticated run creation to return 201, received ${created.status}`);
  const runId = created.body.run.id;

  const auditorToken = token({
    sub: "auditor-oidc-1",
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
  assert(securityApproval.body.latestApproval.reviewerRole === "security-reviewer", "expected OIDC group to map to security-reviewer");
  assert(securityApproval.body.latestApproval.reviewer === "Grant Burley III", "expected reviewer name from OIDC claims");

  console.log(
    JSON.stringify(
      {
        authMode: health.authMode,
        jwksUrl,
        runId,
        anonymousCreateBlocked: anonymousCreate.status === 401,
        unknownKidBlocked: unknownKid.status === 401,
        auditorApprovalBlocked: auditorApproval.status === 403,
        securityReviewerApproved: securityApproval.status === 200,
        approvalRole: securityApproval.body.latestApproval.reviewerRole,
      },
      null,
      2,
    ),
  );
} finally {
  apiServer.kill("SIGTERM");
  await new Promise((resolve) => jwksServer.close(resolve));
  await delay(100);
}
