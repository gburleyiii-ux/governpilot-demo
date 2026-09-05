import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { tmpdir } from "node:os";
import { signLocalJwt } from "../server/auth.mjs";

const jwtSecret = "sentinelops-data-protection-smoke-jwt-secret";
const jwtIssuer = "sentinelops-data-protection-smoke";
const jwtAudience = "sentinelops-api";

function securityToken() {
  const now = Math.floor(Date.now() / 1000);
  return signLocalJwt(
    {
      iss: jwtIssuer,
      aud: jwtAudience,
      iat: now,
      nbf: now - 5,
      exp: now + 600,
      sub: "security-1",
      email: "grant@example.test",
      name: "Grant Burley III",
      groups: ["sentinelops-security-reviewers"],
    },
    jwtSecret,
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await close(server);
  return port;
}

async function waitForHealth(baseUrl, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Retry until the smoke server binds.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("SentinelOps data-protection smoke server did not become healthy.");
}

async function request(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";
  return {
    response,
    raw,
    body: contentType.includes("json") && raw ? JSON.parse(raw) : raw,
  };
}

async function main() {
  const tempDir = path.join(tmpdir(), `sentinelops-data-protection-${process.pid}-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });
  const apiPort = await freePort();
  const baseUrl = `http://127.0.0.1:${apiPort}`;
  const bearer = securityToken();
  const server = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      SENTINELOPS_SIGNING_SECRET: "sentinelops-data-protection-smoke-signing-secret",
      SENTINELOPS_API_HOST: "127.0.0.1",
      SENTINELOPS_API_PORT: String(apiPort),
      SENTINELOPS_LOCAL_STATE_PATH: path.join(tempDir, "state.json"),
      SENTINELOPS_LOCAL_EVIDENCE_PATH: path.join(tempDir, "evidence"),
      SENTINELOPS_DATA_PROTECTION_MODE: "strict-pilot",
      SENTINELOPS_AUTH_MODE: "jwt",
      SENTINELOPS_AUTH_JWT_SECRET: jwtSecret,
      SENTINELOPS_AUTH_ISSUER: jwtIssuer,
      SENTINELOPS_AUTH_AUDIENCE: jwtAudience,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  try {
    await waitForHealth(baseUrl);

    const status = await request(baseUrl, "/api/data-protection");
    assert(status.response.status === 200, `expected data-protection 200, got ${status.response.status}`);
    assert(status.body.mode === "strict-pilot", `expected strict-pilot mode, got ${status.body.mode}`);
    assert(status.body.blockedCategories.includes("ssn"), "expected ssn blocked category");
    assert(status.body.controls.some((control) => control.id === "DP-001"), "expected DP-001 control");

    const cleanRun = await request(baseUrl, "/api/runs", {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ reviewer: "Grant Burley III", note: "Clean synthetic pilot request." }),
    });
    assert(cleanRun.response.status === 201, `expected clean run 201, got ${cleanRun.response.status}`);

    const ssnValue = "123-45-6789";
    const blockedSsn = await request(baseUrl, "/api/runs", {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ reviewer: "Grant Burley III", note: `Synthetic test with SSN ${ssnValue}` }),
    });
    assert(blockedSsn.response.status === 422, `expected SSN block 422, got ${blockedSsn.response.status}`);
    assert(blockedSsn.body.dataProtection.blocked === true, "expected data protection blocked response");
    assert(
      blockedSsn.body.dataProtection.findings.some((finding) => finding.category === "ssn" && finding.path === "$.note"),
      "expected SSN finding on note field",
    );
    assert(!blockedSsn.raw.includes(ssnValue), "expected raw SSN value to be omitted from response");

    const privateKeyValue = "-----BEGIN PRIVATE KEY-----";
    const blockedKey = await request(baseUrl, "/api/runs", {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ reviewer: "Grant Burley III", note: `${privateKeyValue}\nredacted\n-----END PRIVATE KEY-----` }),
    });
    assert(blockedKey.response.status === 422, `expected private key block 422, got ${blockedKey.response.status}`);
    assert(
      blockedKey.body.dataProtection.findings.some((finding) => finding.category === "private-key"),
      "expected private-key finding",
    );
    assert(!blockedKey.raw.includes(privateKeyValue), "expected raw private key marker to be omitted from response");

    console.log(
      JSON.stringify(
        {
          statusMode: status.body.mode,
          cleanRunStatus: cleanRun.response.status,
          blockedSsnStatus: blockedSsn.response.status,
          blockedKeyStatus: blockedKey.response.status,
          blockedCategories: status.body.blockedCategories.length,
          rawSensitiveEchoPrevented: !blockedSsn.raw.includes(ssnValue) && !blockedKey.raw.includes(privateKeyValue),
        },
        null,
        2,
      ),
    );
  } finally {
    server.kill("SIGTERM");
    await rm(tempDir, { recursive: true, force: true });
    if (stderr.includes("Error:")) {
      process.stderr.write(stderr);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
