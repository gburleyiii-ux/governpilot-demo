// GAGS AE-3: signing-key integrity guard.
//
// The audit ledger, approval records, and alert dispatch records are HMAC-signed.
// In development the key falls back to a shipped default so the demo runs without
// secrets. That default is public (it is in source control), so it MUST NOT be used
// to sign records in a real deployment. This module decides, from the environment,
// whether the service is allowed to boot and how its signatures must be labelled.

export const DEV_SIGNING_KEY = "sentinelops-local-dev-signing-key";

function isTruthyFlag(value) {
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on", "required"].includes(value.trim().toLowerCase());
}

// A bind host is "loopback" when the server is only reachable from the local
// machine. An unset host matches index.mjs's default bind of 127.0.0.1. Note that
// 0.0.0.0/:: bind on every interface, so they are treated as NON-loopback.
export function isLoopbackHost(host) {
  if (host === undefined || host === null) return true;
  const value = String(host).trim().toLowerCase();
  if (value === "") return true;
  return ["127.0.0.1", "localhost", "::1", "::ffff:127.0.0.1"].includes(value);
}

// A deployment is "production-like" if any of the following hold. Local/dev
// defaults (all signals absent) stay permissive so the demo runs without secrets:
//   - NODE_ENV=production
//   - SENTINELOPS_REQUIRE_SIGNING_SECRET is explicitly set (opt-in fail-closed)
//   - SENTINELOPS_MODE declares a non-local mode
//   - SENTINELOPS_AUTH_MODE is anything other than local-dev (matches auth.mjs default)
//   - SENTINELOPS_API_HOST binds a non-loopback interface (exposed beyond localhost)
export function isProductionLikeEnv(env = process.env) {
  if (env.NODE_ENV === "production") return true;
  if (isTruthyFlag(env.SENTINELOPS_REQUIRE_SIGNING_SECRET)) return true;
  const mode = (env.SENTINELOPS_MODE || "local").toLowerCase();
  if (mode !== "local" && mode !== "development" && mode !== "test") return true;
  const authMode = (env.SENTINELOPS_AUTH_MODE || "local-dev").toLowerCase();
  if (authMode !== "local-dev") return true;
  if (!isLoopbackHost(env.SENTINELOPS_API_HOST)) return true;
  return false;
}

// Returns { ok, productionLike, hasSecret, signatureMode, reason }.
// ok === false means the service MUST refuse to boot.
export function evaluateSigningPosture(env = process.env) {
  const secret = env.SENTINELOPS_SIGNING_SECRET;
  const hasSecret = typeof secret === "string" && secret.trim().length > 0;
  const productionLike = isProductionLikeEnv(env);
  const usingDevDefault = hasSecret && secret === DEV_SIGNING_KEY;

  if (productionLike && (!hasSecret || usingDevDefault)) {
    return {
      ok: false,
      productionLike,
      hasSecret,
      signatureMode: "refused",
      reason: usingDevDefault
        ? "SENTINELOPS_SIGNING_SECRET is set to the public development default in a production-like environment."
        : "SENTINELOPS_SIGNING_SECRET is required in a production-like environment so audit records are not signed with the public development key.",
    };
  }

  return {
    ok: true,
    productionLike,
    hasSecret,
    signatureMode: hasSecret ? "hmac-sha256" : "local-dev-hmac-sha256",
    reason: hasSecret
      ? "External signing secret present."
      : "Development signing key in use; records are labelled development-signed.",
  };
}

// Boot-time enforcement. Throws (refuses to boot) in a production-like environment
// without a real signing secret. Returns the posture otherwise.
export function assertSigningPostureOrExit(env = process.env, logger = console) {
  const posture = evaluateSigningPosture(env);
  if (!posture.ok) {
    logger.error(`[GAGS AE-3] Refusing to start: ${posture.reason}`);
    logger.error("[GAGS AE-3] Set SENTINELOPS_SIGNING_SECRET to a strong, externally managed value and restart.");
    throw Object.assign(new Error(posture.reason), { code: "SIGNING_SECRET_REQUIRED" });
  }
  return posture;
}

// Single shared resolver for the HMAC signing secret. All record signers (approval
// hash-chain, evidence manifest, alert dispatch) MUST call this instead of reading
// the env var with an inline default, so the public dev key can never silently sign
// records in a production-like environment. Throws when the posture refuses boot;
// returns the development key only when loopback/dev defaults are in effect.
export function resolveSigningSecret(env = process.env) {
  const posture = evaluateSigningPosture(env);
  if (!posture.ok) {
    throw Object.assign(new Error(posture.reason), { code: "SIGNING_SECRET_REQUIRED" });
  }
  return posture.hasSecret ? env.SENTINELOPS_SIGNING_SECRET : DEV_SIGNING_KEY;
}

// Shared label for record signatureMode/signingMode fields: "hmac-sha256" when an
// external secret is in use, "local-dev-hmac-sha256" when the development key is.
export function signatureModeFor(env = process.env) {
  return evaluateSigningPosture(env).signatureMode;
}
