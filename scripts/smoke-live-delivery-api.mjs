import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { createAssessmentRun } from "../server/assessment-engine.mjs";
import { normalizeState } from "../server/storage/state-shape.mjs";

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

async function createHttpCollector() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      requests.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization || null,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  const port = await listen(server);
  return { server, port, requests };
}

async function createSmtpCollector() {
  const messages = [];
  const server = net.createServer((socket) => {
    let mode = "command";
    let body = "";
    socket.write("220 sentinelops-api-test-smtp\r\n");
    socket.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (mode === "data") {
        body += text;
        if (body.includes("\r\n.\r\n")) {
          messages.push(body.replace(/\r\n\.\r\n[\s\S]*$/, ""));
          body = "";
          mode = "command";
          socket.write("250 accepted\r\n");
        }
        return;
      }
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line === "DATA") {
          mode = "data";
          socket.write("354 send body\r\n");
        } else if (line === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else {
          socket.write("250 ok\r\n");
        }
      }
    });
  });
  const port = await listen(server);
  return { server, port, messages };
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
      // Retry until server binds.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("SentinelOps API smoke server did not become healthy.");
}

async function main() {
  const tempDir = path.join("/private/tmp", `sentinelops-live-api-${process.pid}-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });
  const statePath = path.join(tempDir, "state.json");
  const evidencePath = path.join(tempDir, "evidence");
  const run = createAssessmentRun(1);
  run.approvalGate = {
    ...run.approvalGate,
    state: "approved",
    decidedAt: "2026-06-17T01:45:00.000Z",
    reviewer: "Grant Burley III",
  };
  await writeFile(
    statePath,
    `${JSON.stringify(
      normalizeState({
        sequence: 1,
        runs: [run],
        approvals: [],
        policyChecks: [],
        agentReviews: [],
        alertDispatches: [],
        liveDeliveryExecutions: [],
        auditEvents: [],
      }),
      null,
      2,
    )}\n`,
    "utf8",
  );

  const httpCollector = await createHttpCollector();
  const smtpCollector = await createSmtpCollector();
  const apiPort = await freePort();
  const baseUrl = `http://127.0.0.1:${apiPort}`;
  const server = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SENTINELOPS_API_PORT: String(apiPort),
      SENTINELOPS_LOCAL_STATE_PATH: statePath,
      SENTINELOPS_LOCAL_EVIDENCE_PATH: evidencePath,
      SENTINELOPS_ALERT_DELIVERY_MODE: "live",
      SENTINELOPS_LIVE_DELIVERY_APPROVED: "true",
      SENTINELOPS_ALERT_LIVE_PROVIDERS: "email,slack,siem,webhook",
      SENTINELOPS_SMTP_HOST: "127.0.0.1",
      SENTINELOPS_SMTP_PORT: String(smtpCollector.port),
      SENTINELOPS_SMTP_FROM: "sentinelops@example.internal",
      SENTINELOPS_SMTP_TO: "soc@example.internal",
      SENTINELOPS_SMTP_PASSWORD: "api-smtp-secret",
      SENTINELOPS_SLACK_WEBHOOK_URL: `http://127.0.0.1:${httpCollector.port}/api-slack-secret`,
      SENTINELOPS_SIEM_HEC_URL: `http://127.0.0.1:${httpCollector.port}/api-siem`,
      SENTINELOPS_SIEM_HEC_TOKEN: "api-siem-secret",
      SENTINELOPS_ALERT_WEBHOOK_URL: `http://127.0.0.1:${httpCollector.port}/api-webhook-secret`,
      SENTINELOPS_ALERT_WEBHOOK_TOKEN: "api-webhook-secret-token",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  try {
    await waitForHealth(baseUrl);
    const response = await fetch(`${baseUrl}/api/observability/alerts/live-dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewer: "Grant Burley III", reviewerRole: "security-reviewer" }),
    });
    const payload = await response.json();
    assert(response.status === 200, `expected live-dispatch 200, got ${response.status}: ${JSON.stringify(payload)}`);
    assert(payload.status === "live-executed", `expected live-executed, got ${payload.status}`);
    assert(payload.executed === true, "expected API execution flag");
    assert(payload.dispatches.length >= 3, "expected signed live dispatches");
    assert(payload.ledger.passed === true, "expected persisted dispatch ledger to pass");
    assert(payload.attempts.some((attempt) => attempt.providerId === "email-smtp"), "expected SMTP attempt");
    assert(payload.attempts.some((attempt) => attempt.providerId === "slack-webhook"), "expected Slack attempt");
    assert(payload.attempts.some((attempt) => attempt.providerId === "siem-ocsf"), "expected SIEM attempt");
    assert(payload.attempts.some((attempt) => attempt.providerId === "generic-webhook"), "expected generic webhook attempt");
    assert(payload.secretDisclosureDetected === false, "expected secret disclosure guard to pass");
    assert(!JSON.stringify(payload).includes("api-siem-secret"), "expected SIEM token non-disclosure");
    assert(!JSON.stringify(payload).includes("api-webhook-secret"), "expected webhook URL/token non-disclosure");
    assert(!JSON.stringify(payload).includes("api-smtp-secret"), "expected SMTP secret non-disclosure");
    assert(httpCollector.requests.length >= 3, "expected HTTP collector requests");
    assert(smtpCollector.messages.length === 1, "expected one SMTP message");

    console.log(
      JSON.stringify(
        {
          status: payload.status,
          httpStatus: response.status,
          dispatchCount: payload.dispatches.length,
          attemptCount: payload.attempts.length,
          httpRequestCount: httpCollector.requests.length,
          smtpMessageCount: smtpCollector.messages.length,
          ledgerPassed: payload.ledger.passed,
          secretDisclosureDetected: payload.secretDisclosureDetected,
        },
        null,
        2,
      ),
    );
  } finally {
    server.kill("SIGTERM");
    await close(httpCollector.server);
    await close(smtpCollector.server);
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
