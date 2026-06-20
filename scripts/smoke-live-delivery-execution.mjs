import http from "node:http";
import net from "node:net";
import { executeLiveAlertDelivery } from "../server/live-delivery-executor.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includesRawValue(value, raw) {
  return JSON.stringify(value).includes(raw);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
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
    let data = "";
    socket.write("220 sentinelops-test-smtp\r\n");
    socket.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (mode === "data") {
        data += text;
        if (data.includes("\r\n.\r\n")) {
          messages.push(data.replace(/\r\n\.\r\n[\s\S]*$/, ""));
          mode = "command";
          data = "";
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

const summary = {
  generatedAt: "2026-06-17T01:30:00.000Z",
  service: "sentinelops-api",
  version: "0.22.0",
  authMode: "oidc",
  agentMode: "live",
  latestRunId: "run-live-delivery-smoke",
  counts: {
    runs: 1,
    approvals: 1,
    policyChecks: 1,
    agentReviews: 1,
    alertDispatches: 0,
    auditEvents: 1,
  },
  slos: [
    {
      id: "ledger-integrity",
      label: "Approval ledger integrity",
      actual: "fail",
      target: "pass",
      status: "fail",
      detail: "Synthetic live delivery alert.",
    },
  ],
  alerts: [
    {
      id: "live-delivery-smoke-alert",
      severity: "critical",
      title: "Synthetic live delivery alert",
      detail: "Synthetic alert used to prove approved provider execution.",
    },
  ],
};

const httpCollector = await createHttpCollector();
const smtpCollector = await createSmtpCollector();

const env = {
  SENTINELOPS_ALERT_DELIVERY_MODE: "live",
  SENTINELOPS_LIVE_DELIVERY_APPROVED: "true",
  SENTINELOPS_ALERT_LIVE_PROVIDERS: "email,slack,siem,webhook",
  SENTINELOPS_SMTP_HOST: "127.0.0.1",
  SENTINELOPS_SMTP_PORT: String(smtpCollector.port),
  SENTINELOPS_SMTP_FROM: "sentinelops@example.internal",
  SENTINELOPS_SMTP_TO: "soc@example.internal",
  SENTINELOPS_SMTP_PASSWORD: "smtp-secret-value",
  SENTINELOPS_SLACK_WEBHOOK_URL: `http://127.0.0.1:${httpCollector.port}/slack-secret-path`,
  SENTINELOPS_SIEM_HEC_URL: `http://127.0.0.1:${httpCollector.port}/siem`,
  SENTINELOPS_SIEM_HEC_TOKEN: "siem-secret-token",
  SENTINELOPS_ALERT_WEBHOOK_URL: `http://127.0.0.1:${httpCollector.port}/generic-secret-path`,
  SENTINELOPS_ALERT_WEBHOOK_TOKEN: "webhook-secret-token",
};

try {
  const executed = await executeLiveAlertDelivery({
    summary,
    actor: { name: "Grant Burley III", role: "security-reviewer" },
    env,
    version: "0.22.0",
    authMode: "oidc",
    agentMode: "live",
    storage: { mode: "aws-s3-dynamodb" },
    timeoutMs: 2000,
  });

  assert(executed.status === "live-executed", `expected live-executed, received ${executed.status}`);
  assert(executed.executed === true, "expected execution flag");
  assert(executed.dispatches.length === 3, "expected signed email, Slack, and SIEM dispatches");
  assert(executed.siemEvents.length === 1, "expected one SIEM event");
  assert(executed.ledger.passed === true, "expected live dispatch ledger to verify");
  assert(executed.attempts.some((attempt) => attempt.providerId === "email-smtp"), "expected SMTP attempt");
  assert(executed.attempts.some((attempt) => attempt.providerId === "slack-webhook"), "expected Slack attempt");
  assert(executed.attempts.some((attempt) => attempt.providerId === "siem-ocsf"), "expected SIEM attempt");
  assert(executed.attempts.some((attempt) => attempt.providerId === "generic-webhook"), "expected webhook attempt");
  assert(httpCollector.requests.filter((request) => request.url === "/slack-secret-path").length === 1, "expected Slack request");
  assert(httpCollector.requests.filter((request) => request.url === "/siem").length === 1, "expected SIEM request");
  assert(httpCollector.requests.filter((request) => request.url === "/generic-secret-path").length === 3, "expected webhook requests");
  assert(smtpCollector.messages.length === 1, "expected SMTP message");
  assert(!includesRawValue(executed, "smtp-secret-value"), "expected SMTP secret non-disclosure");
  assert(!includesRawValue(executed, "slack-secret-path"), "expected Slack URL non-disclosure");
  assert(!includesRawValue(executed, "siem-secret-token"), "expected SIEM token non-disclosure");
  assert(!includesRawValue(executed, "generic-secret-path"), "expected generic webhook URL non-disclosure");
  assert(!includesRawValue(executed, "webhook-secret-token"), "expected generic webhook token non-disclosure");

  const blocked = await executeLiveAlertDelivery({
    summary,
    actor: { name: "Grant Burley III", role: "security-reviewer" },
    env: {
      ...env,
      SENTINELOPS_LIVE_DELIVERY_APPROVED: "false",
    },
    version: "0.22.0",
    authMode: "oidc",
    agentMode: "live",
    storage: { mode: "aws-s3-dynamodb" },
    timeoutMs: 2000,
  });
  assert(blocked.status === "review-required", "expected missing approval to block execution");
  assert(blocked.dispatches.length === 0, "expected blocked execution to produce no dispatches");

  console.log(
    JSON.stringify(
      {
        status: executed.status,
        dispatchCount: executed.dispatches.length,
        attemptCount: executed.attempts.length,
        httpRequestCount: httpCollector.requests.length,
        smtpMessageCount: smtpCollector.messages.length,
        siemEventCount: executed.siemEvents.length,
        ledgerPassed: executed.ledger.passed,
        blockedStatus: blocked.status,
        secretDisclosureDetected: executed.secretDisclosureDetected,
      },
      null,
      2,
    ),
  );
} finally {
  await close(httpCollector.server);
  await close(smtpCollector.server);
}
