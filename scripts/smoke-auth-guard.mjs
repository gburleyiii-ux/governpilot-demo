// Aegis C1 auth posture smoke
import { evaluateAuthPosture } from "../server/auth.mjs";
const cases = [
  { name: "prod local-dev refuse", env: { NODE_ENV: "production", SENTINELOPS_AUTH_MODE: "local-dev" }, expect: (p) => p.ok === false },
  { name: "0.0.0.0 local-dev refuse", env: { SENTINELOPS_API_HOST: "0.0.0.0", SENTINELOPS_AUTH_MODE: "local-dev" }, expect: (p) => p.ok === false },
  { name: "docker-like refuse", env: { NODE_ENV: "production", SENTINELOPS_API_HOST: "0.0.0.0" }, expect: (p) => p.ok === false },
  { name: "govcloud local-dev refuse", env: { SENTINELOPS_MODE: "govcloud", SENTINELOPS_AUTH_MODE: "local-dev" }, expect: (p) => p.ok === false },
  { name: "loopback local-dev ok", env: { SENTINELOPS_API_HOST: "127.0.0.1", SENTINELOPS_AUTH_MODE: "local-dev" }, expect: (p) => p.ok === true },
  { name: "prod jwt empty secret refuse", env: { NODE_ENV: "production", SENTINELOPS_AUTH_MODE: "jwt" }, expect: (p) => p.ok === false },
  { name: "prod jwt with secret ok", env: { NODE_ENV: "production", SENTINELOPS_AUTH_MODE: "jwt", SENTINELOPS_AUTH_JWT_SECRET: "test-secret" }, expect: (p) => p.ok === true && p.mode === "jwt" },
  { name: "oidc empty config refuse", env: { SENTINELOPS_API_HOST: "0.0.0.0", SENTINELOPS_AUTH_MODE: "oidc" }, expect: (p) => p.ok === false },
  { name: "oidc with jwks issuer audience ok", env: { SENTINELOPS_API_HOST: "0.0.0.0", SENTINELOPS_AUTH_MODE: "oidc", SENTINELOPS_AUTH_JWKS_URL: "https://idp.example/.well-known/jwks.json", SENTINELOPS_AUTH_ISSUER: "https://idp.example", SENTINELOPS_AUTH_AUDIENCE: "sentinelops" }, expect: (p) => p.ok === true && p.mode === "oidc" },
  { name: "unsupported refuse", env: { SENTINELOPS_AUTH_MODE: "basic" }, expect: (p) => p.ok === false },
];
let failures = 0;
for (const c of cases) {
  const posture = evaluateAuthPosture(c.env);
  const pass = Boolean(c.expect(posture));
  if (!pass) failures += 1;
  console.log((pass ? "PASS" : "FAIL") + " — " + c.name + " :: " + JSON.stringify({ ok: posture.ok, mode: posture.mode }));
}
if (failures) { console.error("auth-guard: " + failures + " failure(s)"); process.exit(1); }
console.log("auth-guard: all checks passed");
