// GAGS AE-3 verification: the signing guard must refuse production-like boot
// without a real signing secret, and must label dev-signed records honestly.
import {
  evaluateSigningPosture,
  resolveSigningSecret,
  signatureModeFor,
  DEV_SIGNING_KEY,
} from "../server/signing-guard.mjs";

const cases = [
  {
    name: "production without secret refuses boot",
    env: { NODE_ENV: "production" },
    expect: (p) => p.ok === false && p.signatureMode === "refused",
  },
  {
    name: "production with dev default refuses boot",
    env: { NODE_ENV: "production", SENTINELOPS_SIGNING_SECRET: DEV_SIGNING_KEY },
    expect: (p) => p.ok === false && p.signatureMode === "refused",
  },
  {
    name: "production with real secret boots and uses hmac-sha256",
    env: { NODE_ENV: "production", SENTINELOPS_SIGNING_SECRET: "a-strong-external-key-9f2b" },
    expect: (p) => p.ok === true && p.signatureMode === "hmac-sha256",
  },
  {
    name: "non-local SENTINELOPS_MODE without secret refuses boot",
    env: { SENTINELOPS_MODE: "govcloud" },
    expect: (p) => p.ok === false,
  },
  {
    name: "non-local-dev SENTINELOPS_AUTH_MODE without secret refuses boot",
    env: { SENTINELOPS_AUTH_MODE: "oidc" },
    expect: (p) => p.ok === false && p.signatureMode === "refused",
  },
  {
    name: "SENTINELOPS_REQUIRE_SIGNING_SECRET flag without secret refuses boot",
    env: { SENTINELOPS_REQUIRE_SIGNING_SECRET: "true" },
    expect: (p) => p.ok === false,
  },
  {
    name: "non-loopback API host without secret refuses boot",
    env: { SENTINELOPS_API_HOST: "0.0.0.0" },
    expect: (p) => p.ok === false,
  },
  {
    name: "loopback host + local-dev auth without secret boots dev-signed",
    env: { SENTINELOPS_API_HOST: "127.0.0.1", SENTINELOPS_AUTH_MODE: "local-dev" },
    expect: (p) => p.ok === true && p.signatureMode === "local-dev-hmac-sha256",
  },
  {
    name: "non-loopback host WITH real secret boots and uses hmac-sha256",
    env: { SENTINELOPS_API_HOST: "10.0.0.5", SENTINELOPS_SIGNING_SECRET: "a-strong-external-key-9f2b" },
    expect: (p) => p.ok === true && p.signatureMode === "hmac-sha256",
  },
  {
    name: "local without secret boots, labelled development-signed",
    env: { SENTINELOPS_MODE: "local" },
    expect: (p) => p.ok === true && p.signatureMode === "local-dev-hmac-sha256",
  },
];

let failures = 0;
for (const c of cases) {
  const posture = evaluateSigningPosture(c.env);
  const pass = c.expect(posture);
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"} — ${c.name} :: ${JSON.stringify({ ok: posture.ok, signatureMode: posture.signatureMode })}`);
}

// resolveSigningSecret: returns the dev key only for permissive envs, throws otherwise.
const resolverCases = [
  {
    name: "resolveSigningSecret returns dev key for local env",
    run: () => resolveSigningSecret({ SENTINELOPS_MODE: "local" }) === DEV_SIGNING_KEY,
  },
  {
    name: "resolveSigningSecret returns external secret when present",
    run: () => resolveSigningSecret({ NODE_ENV: "production", SENTINELOPS_SIGNING_SECRET: "ext-key-1234" }) === "ext-key-1234",
  },
  {
    name: "resolveSigningSecret throws SIGNING_SECRET_REQUIRED in prod without secret",
    run: () => {
      try {
        resolveSigningSecret({ NODE_ENV: "production" });
        return false;
      } catch (error) {
        return error.code === "SIGNING_SECRET_REQUIRED";
      }
    },
  },
  {
    name: "resolveSigningSecret never returns the public dev key in a production-like env",
    run: () => {
      try {
        resolveSigningSecret({ SENTINELOPS_AUTH_MODE: "oidc" });
        return false;
      } catch (error) {
        return error.code === "SIGNING_SECRET_REQUIRED";
      }
    },
  },
  {
    name: "signatureModeFor labels external vs dev signing",
    run: () =>
      signatureModeFor({ SENTINELOPS_SIGNING_SECRET: "ext-key-1234" }) === "hmac-sha256" &&
      signatureModeFor({ SENTINELOPS_MODE: "local" }) === "local-dev-hmac-sha256",
  },
];

for (const c of resolverCases) {
  let pass;
  try {
    pass = c.run();
  } catch (error) {
    pass = false;
  }
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"} — ${c.name}`);
}

if (failures > 0) {
  console.error(`\nsigning-guard: ${failures} case(s) failed`);
  process.exit(1);
}
console.log("\nsigning-guard: all cases passed (GAGS AE-3)");
