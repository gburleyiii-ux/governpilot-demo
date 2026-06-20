import net from "node:net";
import tls from "node:tls";
import { routeObservabilityAlerts, verifyAlertDispatchLedger } from "./alert-routing.mjs";
import { buildLiveDeliveryReadiness } from "./live-delivery-readiness.mjs";

const providerTargets = {
  "email-smtp": "email",
  "slack-webhook": "slack",
  "siem-ocsf": "siem",
  "generic-webhook": "webhook",
};

function requestedReadyProviders(readiness) {
  return readiness.providers.filter((provider) => provider.requestedForLive && provider.status === "ready");
}

function safeAttempt({ providerId, target, routeId = null, alertId = null, status, statusCode = null, bytes = 0, detail = null }) {
  return {
    providerId,
    target,
    routeId,
    alertId,
    status,
    statusCode,
    bytes,
    destination: "server-side-configured",
    detail,
  };
}

async function postJson(url, body, headers = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return { statusCode: response.status, bytes: text.length };
  } finally {
    clearTimeout(timeout);
  }
}

function smtpLineReader(socket) {
  let buffer = "";
  const waiters = [];

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    flush();
  });

  function flush() {
    while (waiters.length && buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const line = buffer.slice(0, index + 1);
      buffer = buffer.slice(index + 1);
      waiters.shift()(line);
    }
  }

  return function readLine(timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("SMTP response timeout")), timeoutMs);
      waiters.push((line) => {
        clearTimeout(timeout);
        resolve(line);
      });
      flush();
    });
  };
}

async function sendSmtpCommand(socket, readLine, command, expectedCodes = ["250"], timeoutMs = 2500) {
  if (command) {
    socket.write(`${command}\r\n`);
  }
  const line = await readLine(timeoutMs);
  const code = line.slice(0, 3);
  if (!expectedCodes.includes(code)) {
    throw new Error(`SMTP expected ${expectedCodes.join("/")} but received ${code}`);
  }
  return line;
}

async function sendSmtpMail(env, dispatches, timeoutMs = 2500) {
  const host = env.SENTINELOPS_SMTP_HOST;
  const port = Number(env.SENTINELOPS_SMTP_PORT || 25);
  const from = env.SENTINELOPS_SMTP_FROM;
  const to = env.SENTINELOPS_SMTP_TO || env.SENTINELOPS_SMTP_FROM;
  const useTls = env.SENTINELOPS_SMTP_TLS === "true" || port === 465;
  const socket = useTls
    ? tls.connect({ host, port, servername: host, rejectUnauthorized: env.SENTINELOPS_SMTP_REJECT_UNAUTHORIZED !== "false" })
    : net.connect({ host, port });
  const readLine = smtpLineReader(socket);

  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
    setTimeout(() => reject(new Error("SMTP connection timeout")), timeoutMs);
  });

  try {
    await sendSmtpCommand(socket, readLine, null, ["220"], timeoutMs);
    await sendSmtpCommand(socket, readLine, "EHLO sentinelops.local", ["250"], timeoutMs);
    if (env.SENTINELOPS_SMTP_USERNAME && env.SENTINELOPS_SMTP_PASSWORD) {
      await sendSmtpCommand(socket, readLine, "AUTH LOGIN", ["334"], timeoutMs);
      await sendSmtpCommand(socket, readLine, Buffer.from(env.SENTINELOPS_SMTP_USERNAME).toString("base64"), ["334"], timeoutMs);
      await sendSmtpCommand(socket, readLine, Buffer.from(env.SENTINELOPS_SMTP_PASSWORD).toString("base64"), ["235"], timeoutMs);
    }
    await sendSmtpCommand(socket, readLine, `MAIL FROM:<${from}>`, ["250"], timeoutMs);
    await sendSmtpCommand(socket, readLine, `RCPT TO:<${to}>`, ["250", "251"], timeoutMs);
    await sendSmtpCommand(socket, readLine, "DATA", ["354"], timeoutMs);
    const subject = `SentinelOps governance alerts: ${dispatches.length}`;
    const body = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      "SentinelOps AI live delivery execution.",
      `Dispatch count: ${dispatches.length}`,
      `Run IDs: ${[...new Set(dispatches.map((dispatch) => dispatch.runId || "none"))].join(", ")}`,
      `Alert IDs: ${[...new Set(dispatches.map((dispatch) => dispatch.alertId))].join(", ")}`,
      "",
      "Credentials and raw sensitive payloads are not included in this message.",
      ".",
    ].join("\r\n");
    await sendSmtpCommand(socket, readLine, body, ["250"], timeoutMs);
    socket.write("QUIT\r\n");
  } finally {
    socket.end();
  }
}

function dispatchesForTarget(dispatches, target) {
  return dispatches.filter((dispatch) => dispatch.target === target);
}

async function deliverProvider(provider, dispatches, env, timeoutMs) {
  const attempts = [];
  if (provider.id === "email-smtp") {
    const emailDispatches = dispatchesForTarget(dispatches, "email");
    if (!emailDispatches.length) return attempts;
    await sendSmtpMail(env, emailDispatches, timeoutMs);
    attempts.push(
      safeAttempt({
        providerId: provider.id,
        target: providerTargets[provider.id],
        routeId: "soc-email",
        alertId: "batched-email-alerts",
        status: "delivered",
        bytes: emailDispatches.length,
      }),
    );
    return attempts;
  }

  if (provider.id === "slack-webhook") {
    for (const dispatch of dispatchesForTarget(dispatches, "slack")) {
      const response = await postJson(
        env.SENTINELOPS_SLACK_WEBHOOK_URL,
        {
          text: `${dispatch.alertSeverity.toUpperCase()}: ${dispatch.alertTitle}`,
          routeId: dispatch.routeId,
          alertId: dispatch.alertId,
          runId: dispatch.runId,
          signature: dispatch.signature,
        },
        {},
        timeoutMs,
      );
      attempts.push(
        safeAttempt({
          providerId: provider.id,
          target: providerTargets[provider.id],
          routeId: dispatch.routeId,
          alertId: dispatch.alertId,
          status: "delivered",
          statusCode: response.statusCode,
          bytes: response.bytes,
        }),
      );
    }
    return attempts;
  }

  if (provider.id === "siem-ocsf") {
    const url = env.SENTINELOPS_SIEM_HEC_URL || env.SENTINELOPS_SIEM_ENDPOINT;
    const headers = env.SENTINELOPS_SIEM_HEC_TOKEN ? { Authorization: `Bearer ${env.SENTINELOPS_SIEM_HEC_TOKEN}` } : {};
    for (const dispatch of dispatchesForTarget(dispatches, "siem")) {
      const response = await postJson(url, dispatch.siemEvent, headers, timeoutMs);
      attempts.push(
        safeAttempt({
          providerId: provider.id,
          target: providerTargets[provider.id],
          routeId: dispatch.routeId,
          alertId: dispatch.alertId,
          status: "delivered",
          statusCode: response.statusCode,
          bytes: response.bytes,
          detail: "ocsf-event-accepted",
        }),
      );
    }
    return attempts;
  }

  if (provider.id === "generic-webhook") {
    const headers = env.SENTINELOPS_ALERT_WEBHOOK_TOKEN
      ? { Authorization: `Bearer ${env.SENTINELOPS_ALERT_WEBHOOK_TOKEN}` }
      : {};
    for (const dispatch of dispatches) {
      const response = await postJson(
        env.SENTINELOPS_ALERT_WEBHOOK_URL,
        {
          dispatch,
          siemEvent: dispatch.siemEvent || null,
          signature: dispatch.signature,
        },
        headers,
        timeoutMs,
      );
      attempts.push(
        safeAttempt({
          providerId: provider.id,
          target: providerTargets[provider.id],
          routeId: dispatch.routeId,
          alertId: dispatch.alertId,
          status: "delivered",
          statusCode: response.statusCode,
          bytes: response.bytes,
        }),
      );
    }
    return attempts;
  }

  return attempts;
}

function includesRawSecret(value, env) {
  const raw = [
    env.SENTINELOPS_SMTP_PASSWORD,
    env.SENTINELOPS_SLACK_WEBHOOK_URL,
    env.SENTINELOPS_SIEM_HEC_TOKEN,
    env.SENTINELOPS_ALERT_WEBHOOK_URL,
    env.SENTINELOPS_ALERT_WEBHOOK_TOKEN,
  ].filter(Boolean);
  const json = JSON.stringify(value);
  return raw.some((secret) => json.includes(secret));
}

export async function executeLiveAlertDelivery({
  summary,
  actor,
  previousHash = null,
  env = process.env,
  service = "sentinelops-api",
  version = "unknown",
  authMode = "unknown",
  agentMode = "deterministic-local",
  storage = null,
  timeoutMs = 2500,
} = {}) {
  const readiness = buildLiveDeliveryReadiness({ env, service, version, authMode, agentMode, storage });
  if (readiness.status !== "live-ready") {
    return {
      status: "review-required",
      executed: false,
      reason: "Live delivery requires explicit approval and complete server-side provider configuration.",
      readiness,
      routes: [],
      dispatches: [],
      siemEvents: [],
      attempts: [],
      ledger: verifyAlertDispatchLedger([]),
      secretDisclosureDetected: false,
    };
  }

  const routed = routeObservabilityAlerts(summary, actor, previousHash, {
    deliveryMode: "live-provider",
    deliveryStatus: "live-delivered",
  });
  const providers = requestedReadyProviders(readiness);
  const attempts = [];

  try {
    for (const provider of providers) {
      attempts.push(...(await deliverProvider(provider, routed.dispatches, env, timeoutMs)));
    }
  } catch (error) {
    return {
      status: "delivery-failed",
      executed: false,
      reason: error.message,
      readiness,
      routes: routed.routes,
      dispatches: [],
      siemEvents: [],
      attempts,
      ledger: verifyAlertDispatchLedger([]),
      secretDisclosureDetected: includesRawSecret({ attempts, reason: error.message }, env),
    };
  }

  const result = {
    status: "live-executed",
    executed: true,
    readiness,
    routes: routed.routes,
    dispatches: routed.dispatches,
    siemEvents: routed.siemEvents,
    attempts,
    ledger: verifyAlertDispatchLedger(routed.dispatches),
    secretDisclosureDetected: false,
  };
  result.secretDisclosureDetected = includesRawSecret(result, env);
  return result;
}
