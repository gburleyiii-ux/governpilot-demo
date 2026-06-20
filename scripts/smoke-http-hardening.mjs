import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

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
  throw new Error("SentinelOps hardening smoke server did not become healthy.");
}

function header(response, name) {
  return response.headers.get(name) || "";
}

async function main() {
  const tempDir = path.join("/private/tmp", `sentinelops-hardening-${process.pid}-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });
  const apiPort = await freePort();
  const baseUrl = `http://127.0.0.1:${apiPort}`;
  const allowedOrigin = "https://allowed.example";
  const blockedOrigin = "https://blocked.example";

  const server = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      SENTINELOPS_SIGNING_SECRET: "sentinelops-hardening-smoke-signing-secret",
      SENTINELOPS_API_PORT: String(apiPort),
      SENTINELOPS_LOCAL_STATE_PATH: path.join(tempDir, "state.json"),
      SENTINELOPS_LOCAL_EVIDENCE_PATH: path.join(tempDir, "evidence"),
      SENTINELOPS_CORS_ORIGINS: allowedOrigin,
      SENTINELOPS_MAX_JSON_BYTES: "64",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  try {
    await waitForHealth(baseUrl);

    const allowed = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: allowedOrigin },
    });
    assert(allowed.status === 200, `expected allowed health 200, got ${allowed.status}`);
    assert(header(allowed, "access-control-allow-origin") === allowedOrigin, "expected exact allowed CORS origin");
    assert(header(allowed, "access-control-allow-origin") !== "*", "expected CORS wildcard to be disabled");
    assert(header(allowed, "content-security-policy").includes("frame-ancestors 'none'"), "expected CSP frame guard");
    assert(header(allowed, "cross-origin-opener-policy") === "same-origin", "expected COOP header");
    assert(header(allowed, "strict-transport-security").includes("max-age=31536000"), "expected HSTS header");
    assert(header(allowed, "x-frame-options") === "DENY", "expected frame denial header");
    assert(header(allowed, "x-content-type-options") === "nosniff", "expected nosniff header");
    assert(header(allowed, "referrer-policy") === "no-referrer", "expected referrer policy header");
    assert(header(allowed, "permissions-policy").includes("camera=()"), "expected permissions policy header");

    const blocked = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: blockedOrigin },
    });
    assert(blocked.status === 200, `expected blocked-origin health 200, got ${blocked.status}`);
    assert(!header(blocked, "access-control-allow-origin"), "expected blocked origin to receive no CORS grant");

    const options = await fetch(`${baseUrl}/api/health`, {
      method: "OPTIONS",
      headers: {
        Origin: allowedOrigin,
        "Access-Control-Request-Method": "POST",
      },
    });
    assert(options.status === 204, `expected OPTIONS 204, got ${options.status}`);
    assert(header(options, "access-control-allow-origin") === allowedOrigin, "expected OPTIONS CORS grant");
    assert(header(options, "access-control-allow-methods").includes("POST"), "expected POST in allowed methods");

    const invalidJson = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: allowedOrigin,
      },
      body: "{",
    });
    assert(invalidJson.status === 400, `expected invalid JSON 400, got ${invalidJson.status}`);
    assert(header(invalidJson, "access-control-allow-origin") === allowedOrigin, "expected invalid JSON CORS grant");

    const oversized = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: allowedOrigin,
      },
      body: JSON.stringify({ payload: "x".repeat(128) }),
    });
    assert(oversized.status === 413, `expected oversized JSON 413, got ${oversized.status}`);

    console.log(
      JSON.stringify(
        {
          apiPort,
          allowedOrigin,
          blockedOrigin,
          cspPresent: header(allowed, "content-security-policy").includes("frame-ancestors 'none'"),
          exactCors: header(allowed, "access-control-allow-origin") === allowedOrigin,
          blockedCorsDenied: !header(blocked, "access-control-allow-origin"),
          invalidJsonStatus: invalidJson.status,
          oversizedStatus: oversized.status,
          optionsStatus: options.status,
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
