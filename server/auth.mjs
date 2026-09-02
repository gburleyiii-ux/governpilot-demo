import { createHmac, createPublicKey, createSign, createVerify, timingSafeEqual } from "node:crypto";
import { defaultActor, getRole, resolveActor } from "./rbac.mjs";
import { isProductionLikeEnv } from "./signing-guard.mjs";

const defaultGroupRoleMap = {
  "sentinelops-security-reviewers": "security-reviewer",
  "sentinelops-compliance-analysts": "compliance-analyst",
  "sentinelops-auditors": "auditor",
  "sentinelops-operators": "operator",
};

function base64UrlDecode(value) {
  return base64UrlDecodeBuffer(value).toString("utf8");
}

function base64UrlDecodeBuffer(value) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function readHeader(headers, name) {
  return headers?.[name] || headers?.[name.toLowerCase()] || null;
}

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} must be valid JSON.`);
  }
}

function authMode() {
  return process.env.SENTINELOPS_AUTH_MODE || "local-dev";
}

function oidcJwksUrl() {
  return process.env.SENTINELOPS_AUTH_JWKS_URL || null;
}

function jwksCacheMs() {
  const configured = Number(process.env.SENTINELOPS_AUTH_JWKS_CACHE_MS || 300000);
  return Number.isFinite(configured) && configured > 0 ? configured : 300000;
}

function clockToleranceSeconds() {
  const configured = Number(process.env.SENTINELOPS_AUTH_CLOCK_TOLERANCE_SECONDS || 30);
  return Number.isFinite(configured) && configured >= 0 ? configured : 30;
}

function groupClaimNames() {
  const configured = process.env.SENTINELOPS_AUTH_GROUP_CLAIM;
  return configured ? [configured] : ["sentinelops_groups", "groups", "roles", "cognito:groups"];
}

function extractGroups(claims) {
  for (const claimName of groupClaimNames()) {
    const value = claims[claimName];
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string" && value.trim()) return value.split(/[,\s]+/).filter(Boolean);
  }
  return [];
}

function resolveRoleFromClaims(claims) {
  const explicitRole = claims.sentinelops_role || claims.role;
  if (typeof explicitRole === "string" && getRole(explicitRole)) {
    return explicitRole;
  }

  const groupRoleMap = parseJsonEnv("SENTINELOPS_AUTH_GROUP_ROLE_MAP", defaultGroupRoleMap);
  const groups = extractGroups(claims);
  for (const group of groups) {
    const role = groupRoleMap[group];
    if (role && getRole(role)) {
      return role;
    }
  }

  return null;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseJwt(jwt) {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new Error("JWT must contain three segments.");
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const header = JSON.parse(base64UrlDecode(encodedHeader));
  const claims = JSON.parse(base64UrlDecode(encodedPayload));

  return {
    encodedHeader,
    encodedPayload,
    signature,
    header,
    claims,
    signingInput: `${encodedHeader}.${encodedPayload}`,
  };
}

function verifyHs256(jwt, secret) {
  const { encodedHeader, encodedPayload, signature, header, claims } = parseJwt(jwt);
  if (header.alg !== "HS256") {
    throw new Error("Only HS256 JWTs are supported by the local verifier.");
  }

  const expectedSignature = createHmac("sha256", secret).update(`${encodedHeader}.${encodedPayload}`).digest("base64url");
  if (!safeEqual(signature, expectedSignature)) {
    throw new Error("JWT signature verification failed.");
  }

  return claims;
}

function validateClaims(claims) {
  const now = Math.floor(Date.now() / 1000);
  const tolerance = clockToleranceSeconds();
  if (typeof claims.exp === "number" && claims.exp + tolerance < now) {
    throw new Error("JWT is expired.");
  }
  if (typeof claims.nbf === "number" && claims.nbf - tolerance > now) {
    throw new Error("JWT is not valid yet.");
  }
  if (process.env.SENTINELOPS_AUTH_ISSUER && claims.iss !== process.env.SENTINELOPS_AUTH_ISSUER) {
    throw new Error("JWT issuer does not match SENTINELOPS_AUTH_ISSUER.");
  }
  if (process.env.SENTINELOPS_AUTH_AUDIENCE) {
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(process.env.SENTINELOPS_AUTH_AUDIENCE)) {
      throw new Error("JWT audience does not match SENTINELOPS_AUTH_AUDIENCE.");
    }
  }
}

function actorFromClaims(claims, authSource = "jwt") {
  const role = resolveRoleFromClaims(claims);
  if (!role) {
    throw new Error("JWT does not map to a SentinelOps reviewer role.");
  }
  return {
    name: claims.name || claims.preferred_username || claims.email || claims.sub || defaultActor.name,
    role,
    email: claims.email || null,
    subject: claims.sub || null,
    authSource,
  };
}

function safeJwksUrl(rawUrl) {
  if (!rawUrl) {
    throw new Error("SENTINELOPS_AUTH_JWKS_URL is required when SENTINELOPS_AUTH_MODE=oidc.");
  }
  const parsed = new URL(rawUrl);
  const localhost = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localhost) {
    throw new Error("SENTINELOPS_AUTH_JWKS_URL must use HTTPS except for localhost smoke tests.");
  }
  return parsed.toString();
}

function validateOidcConfig() {
  safeJwksUrl(oidcJwksUrl());
  if (!process.env.SENTINELOPS_AUTH_ISSUER) {
    throw new Error("SENTINELOPS_AUTH_ISSUER is required when SENTINELOPS_AUTH_MODE=oidc.");
  }
  if (!process.env.SENTINELOPS_AUTH_AUDIENCE) {
    throw new Error("SENTINELOPS_AUTH_AUDIENCE is required when SENTINELOPS_AUTH_MODE=oidc.");
  }
}

const jwksCache = new Map();

async function loadJwks() {
  const url = safeJwksUrl(oidcJwksUrl());
  const cached = jwksCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.jwks;
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`JWKS fetch failed with HTTP ${response.status}.`);
  }
  const jwks = await response.json();
  if (!Array.isArray(jwks.keys)) {
    throw new Error("JWKS response must include a keys array.");
  }
  jwksCache.set(url, {
    jwks,
    expiresAt: Date.now() + jwksCacheMs(),
  });
  return jwks;
}

function selectJwk(keys, header) {
  if (header.alg !== "RS256") {
    throw new Error("OIDC verifier only accepts RS256 JWTs.");
  }
  const signingKeys = keys.filter((key) => key.kty === "RSA" && (!key.use || key.use === "sig") && (!key.alg || key.alg === "RS256"));
  if (header.kid) {
    const match = signingKeys.find((key) => key.kid === header.kid);
    if (!match) {
      throw new Error("No JWKS signing key matched the JWT kid.");
    }
    return match;
  }
  if (signingKeys.length === 1) {
    return signingKeys[0];
  }
  throw new Error("JWT kid is required when JWKS exposes multiple signing keys.");
}

async function verifyRs256WithJwks(jwt) {
  const parsed = parseJwt(jwt);
  const jwks = await loadJwks();
  const jwk = selectJwk(jwks.keys, parsed.header);
  const publicKey = createPublicKey({
    key: jwk,
    format: "jwk",
  });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(parsed.signingInput);
  verifier.end();
  if (!verifier.verify(publicKey, base64UrlDecodeBuffer(parsed.signature))) {
    throw new Error("JWT signature verification failed.");
  }
  return parsed.claims;
}

function bearerToken(headers) {
  const authorization = readHeader(headers, "authorization");
  const match = typeof authorization === "string" ? authorization.match(/^Bearer\s+(.+)$/i) : null;
  return match?.[1] || null;
}

export async function resolveRequestActor(body = {}, headers = {}) {
  const mode = authMode();
  if (mode === "jwt" || mode === "oidc") {
    const token = bearerToken(headers);
    if (!token) {
      return {
        ok: false,
        status: 401,
        error: "missing_token",
        message: "Authorization bearer token is required.",
      };
    }
    if (mode === "jwt" && !process.env.SENTINELOPS_AUTH_JWT_SECRET) {
      return {
        ok: false,
        status: 500,
        error: "auth_not_configured",
        message: "SENTINELOPS_AUTH_JWT_SECRET is required when SENTINELOPS_AUTH_MODE=jwt.",
      };
    }
    if (mode === "oidc") {
      try {
        validateOidcConfig();
      } catch (error) {
        return {
          ok: false,
          status: 500,
          error: "auth_not_configured",
          message: error.message || "OIDC authentication is not configured.",
        };
      }
    }
    try {
      const claims = mode === "jwt" ? verifyHs256(token, process.env.SENTINELOPS_AUTH_JWT_SECRET) : await verifyRs256WithJwks(token);
      validateClaims(claims);
      return {
        ok: true,
        actor: actorFromClaims(claims, mode),
        claims: {
          iss: claims.iss || null,
          aud: claims.aud || null,
          sub: claims.sub || null,
        },
      };
    } catch (error) {
      return {
        ok: false,
        status: 401,
        error: "invalid_token",
        message: error.message || "JWT verification failed.",
      };
    }
  }

  return {
    ok: true,
    actor: {
      ...resolveActor(body, headers),
      authSource: "local-dev",
    },
  };
}

export function authContext() {
  const jwksUrl = oidcJwksUrl();
  let jwksHost = null;
  if (jwksUrl) {
    try {
      jwksHost = new URL(jwksUrl).host;
    } catch {
      jwksHost = "invalid-url";
    }
  }
  return {
    mode: authMode(),
    defaultActor,
    jwt: {
      algorithm: "HS256",
      issuerConfigured: Boolean(process.env.SENTINELOPS_AUTH_ISSUER),
      audienceConfigured: Boolean(process.env.SENTINELOPS_AUTH_AUDIENCE),
      groupClaims: groupClaimNames(),
      groupRoleMap: parseJsonEnv("SENTINELOPS_AUTH_GROUP_ROLE_MAP", defaultGroupRoleMap),
    },
    oidc: {
      algorithm: "RS256",
      jwksConfigured: Boolean(jwksUrl),
      jwksHost,
      jwksCacheMs: jwksCacheMs(),
      issuerConfigured: Boolean(process.env.SENTINELOPS_AUTH_ISSUER),
      audienceConfigured: Boolean(process.env.SENTINELOPS_AUTH_AUDIENCE),
      groupClaims: groupClaimNames(),
      groupRoleMap: parseJsonEnv("SENTINELOPS_AUTH_GROUP_ROLE_MAP", defaultGroupRoleMap),
    },
  };
}


export function evaluateAuthPosture(env = process.env) {
  const mode = String(env.SENTINELOPS_AUTH_MODE || "local-dev").toLowerCase();
  if (mode === "jwt") {
    const secret = typeof env.SENTINELOPS_AUTH_JWT_SECRET === "string" ? env.SENTINELOPS_AUTH_JWT_SECRET.trim() : "";
    if (!secret) {
      return {
        ok: false,
        mode,
        productionLike: isProductionLikeEnv(env),
        reason: "SENTINELOPS_AUTH_JWT_SECRET is required when SENTINELOPS_AUTH_MODE=jwt.",
      };
    }
    return {
      ok: true,
      mode,
      productionLike: isProductionLikeEnv(env),
      reason: "Auth mode jwt is configured with a JWT secret.",
    };
  }
  if (mode === "oidc") {
    const jwks = typeof env.SENTINELOPS_AUTH_JWKS_URL === "string" ? env.SENTINELOPS_AUTH_JWKS_URL.trim() : "";
    const issuer = typeof env.SENTINELOPS_AUTH_ISSUER === "string" ? env.SENTINELOPS_AUTH_ISSUER.trim() : "";
    const audience = typeof env.SENTINELOPS_AUTH_AUDIENCE === "string" ? env.SENTINELOPS_AUTH_AUDIENCE.trim() : "";
    if (!jwks || !issuer || !audience) {
      return {
        ok: false,
        mode,
        productionLike: isProductionLikeEnv(env),
        reason:
          "SENTINELOPS_AUTH_JWKS_URL, SENTINELOPS_AUTH_ISSUER, and SENTINELOPS_AUTH_AUDIENCE are required when SENTINELOPS_AUTH_MODE=oidc.",
      };
    }
    return {
      ok: true,
      mode,
      productionLike: isProductionLikeEnv(env),
      reason: "Auth mode oidc is configured with JWKS/issuer/audience.",
    };
  }
  if (mode !== "local-dev") {
    return {
      ok: false,
      mode,
      productionLike: true,
      reason: `Unsupported SENTINELOPS_AUTH_MODE=${mode}; use jwt, oidc, or local-dev.`,
    };
  }
  const productionLike = isProductionLikeEnv(env);
  if (productionLike) {
    return {
      ok: false,
      mode,
      productionLike,
      reason:
        "SENTINELOPS_AUTH_MODE=local-dev is not allowed in a production-like or non-loopback environment; set SENTINELOPS_AUTH_MODE=jwt or oidc.",
    };
  }
  return {
    ok: true,
    mode,
    productionLike: false,
    reason: "local-dev auth allowed on loopback / non-production-like defaults.",
  };
}

export function assertAuthPostureOrExit(env = process.env, logger = console) {
  const posture = evaluateAuthPosture(env);
  if (!posture.ok) {
    logger.error(`[GAGS IA] Refusing to start: ${posture.reason}`);
    logger.error("[GAGS IA] Set SENTINELOPS_AUTH_MODE=jwt|oidc (with required secrets/JWKS) for non-loopback or production-like deploys.");
    throw Object.assign(new Error(posture.reason), { code: "AUTH_MODE_REQUIRED" });
  }
  return posture;
}

export function unauthorizedResponse(authResult) {
  return {
    error: authResult.error || "unauthorized",
    message: authResult.message || "Authentication failed.",
  };
}

export function signLocalJwt(claims, secret) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function signLocalRs256Jwt(claims, privateKey, options = {}) {
  const header = base64UrlEncode(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
      kid: options.kid || "sentinelops-local-rsa-1",
    }),
  );
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}
