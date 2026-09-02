// H3 / Grant hard lock: Stripe TEST MODE ONLY this pass.
// Refuse STRIPE_MODE=live and any live key material. No owner-flag bypass.
import { createHmac, timingSafeEqual } from "node:crypto";

function readTrimmed(env, name) {
  const raw = env[name];
  return typeof raw === "string" ? raw.trim() : "";
}

function looksLikeLiveKey(value) {
  if (!value) return false;
  return /(?:sk|pk|rk)_live_[A-Za-z0-9]+/.test(value) || value.includes("_live_");
}

function looksLikeTestKey(value) {
  if (!value) return false;
  return /(?:sk|pk|rk)_test_[A-Za-z0-9]+/.test(value);
}

export function evaluateStripePosture(env = process.env) {
  const modeRaw = readTrimmed(env, "STRIPE_MODE");
  const mode = modeRaw.toLowerCase();
  const secretKey = readTrimmed(env, "STRIPE_SECRET_KEY");
  const publishableKey = readTrimmed(env, "STRIPE_PUBLISHABLE_KEY");
  const webhookSecret = readTrimmed(env, "STRIPE_WEBHOOK_SECRET");
  const allMaterial = [secretKey, publishableKey, webhookSecret, modeRaw].join(" ");

  // Disabled: no mode and no key material.
  if (!mode && !secretKey && !publishableKey && !webhookSecret) {
    return {
      ok: true,
      enabled: false,
      mode: "disabled",
      reason: "Stripe disabled (STRIPE_MODE unset; no Stripe keys present).",
    };
  }

  // Grant hard lock: refuse live mode and live keys entirely this pass.
  if (mode === "live") {
    return {
      ok: false,
      enabled: false,
      mode: "live",
      reason: "STRIPE_MODE=live is refused this pass (Grant hard lock: test mode only; no live money).",
    };
  }
  if (looksLikeLiveKey(allMaterial)) {
    return {
      ok: false,
      enabled: false,
      mode: mode || "invalid",
      reason: "Live Stripe key material detected; refused this pass (Grant hard lock: test mode only).",
    };
  }

  if (mode && mode !== "test") {
    return {
      ok: false,
      enabled: false,
      mode,
      reason: `Unsupported STRIPE_MODE=${mode}; only "test" is allowed this pass (or leave unset to disable).`,
    };
  }

  // Mode omitted but keys present → require explicit test.
  if (!mode && (secretKey || publishableKey || webhookSecret)) {
    return {
      ok: false,
      enabled: false,
      mode: "unset",
      reason: "Stripe key material present without STRIPE_MODE=test; set STRIPE_MODE=test or remove keys.",
    };
  }

  // test mode
  if (secretKey && !looksLikeTestKey(secretKey)) {
    return {
      ok: false,
      enabled: false,
      mode: "test",
      reason: "STRIPE_SECRET_KEY must be a test key (sk_test_…) when STRIPE_MODE=test.",
    };
  }
  if (publishableKey && !looksLikeTestKey(publishableKey)) {
    return {
      ok: false,
      enabled: false,
      mode: "test",
      reason: "STRIPE_PUBLISHABLE_KEY must be a test key (pk_test_…) when STRIPE_MODE=test.",
    };
  }

  return {
    ok: true,
    enabled: true,
    mode: "test",
    hasSecretKey: Boolean(secretKey),
    hasPublishableKey: Boolean(publishableKey),
    hasWebhookSecret: Boolean(webhookSecret),
    reason: "Stripe test mode allowed (Grant hard lock: live refused).",
  };
}

export function assertStripePostureOrExit(env = process.env, logger = console) {
  const posture = evaluateStripePosture(env);
  if (!posture.ok) {
    logger.error(`[H3 Stripe] Refusing to start: ${posture.reason}`);
    logger.error("[H3 Stripe] Grant hard lock: STRIPE_MODE=test only; no live money / live keys this pass.");
    throw Object.assign(new Error(posture.reason), { code: "STRIPE_MODE_REFUSED" });
  }
  return posture;
}

/** Verify Stripe-Signature header for test webhooks (HMAC SHA-256). */
export function verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret, toleranceSeconds = 300) {
  if (!webhookSecret) {
    return { ok: false, error: "missing_webhook_secret", message: "STRIPE_WEBHOOK_SECRET is required to verify webhooks." };
  }
  if (!signatureHeader || typeof signatureHeader !== "string") {
    return { ok: false, error: "missing_signature", message: "Stripe-Signature header is required." };
  }
  if (looksLikeLiveKey(webhookSecret) || webhookSecret.includes("_live_")) {
    return { ok: false, error: "live_webhook_secret_refused", message: "Live webhook secrets are refused this pass." };
  }

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((piece) => {
      const [k, ...rest] = piece.trim().split("=");
      return [k, rest.join("=")];
    }),
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) {
    return { ok: false, error: "invalid_signature_header", message: "Stripe-Signature must include t and v1." };
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, error: "invalid_timestamp", message: "Stripe-Signature timestamp is invalid." };
  }
  const age = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (age > toleranceSeconds) {
    return { ok: false, error: "timestamp_out_of_tolerance", message: "Stripe-Signature timestamp outside tolerance." };
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", webhookSecret).update(signedPayload, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(v1, "utf8");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return { ok: false, error: "invalid_signature", message: "Stripe webhook signature verification failed." };
  }
  return { ok: true, timestamp: ts };
}

export function stripeStatus(env = process.env) {
  const posture = evaluateStripePosture(env);
  return {
    enabled: posture.enabled,
    mode: posture.mode,
    liveAllowed: false,
    grantLock: "test-only-no-live-money",
    ok: posture.ok,
    reason: posture.reason,
  };
}
