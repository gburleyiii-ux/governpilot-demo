// H3 Grant hard lock: Stripe test-only / refuse live.
import {
  evaluateStripePosture,
  verifyStripeWebhookSignature,
} from "../server/stripe-guard.mjs";
import { createHmac as nodeHmac } from "node:crypto";

// re-export path: verify helper is in stripe-guard; local signer for tests
function sign(body, secret, ts = Math.floor(Date.now() / 1000)) {
  const v1 = nodeHmac("sha256", secret).update(`${ts}.${body}`, "utf8").digest("hex");
  return { header: `t=${ts},v1=${v1}`, ts };
}

const cases = [
  { name: "disabled ok", env: {}, expect: (p) => p.ok && p.mode === "disabled" && !p.enabled },
  { name: "live mode refuse", env: { STRIPE_MODE: "live" }, expect: (p) => !p.ok && p.mode === "live" },
  { name: "live secret refuse", env: { STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_live_abc" }, expect: (p) => !p.ok },
  { name: "live publishable refuse", env: { STRIPE_MODE: "test", STRIPE_PUBLISHABLE_KEY: "pk_live_abc" }, expect: (p) => !p.ok },
  { name: "keys without mode refuse", env: { STRIPE_SECRET_KEY: "sk_test_abc" }, expect: (p) => !p.ok },
  { name: "unsupported mode refuse", env: { STRIPE_MODE: "sandbox" }, expect: (p) => !p.ok },
  { name: "test mode ok", env: { STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_test_abc" }, expect: (p) => p.ok && p.enabled && p.mode === "test" },
  { name: "test mode without keys ok", env: { STRIPE_MODE: "test" }, expect: (p) => p.ok && p.enabled && p.mode === "test" },
];

let failures = 0;
for (const c of cases) {
  const posture = evaluateStripePosture(c.env);
  const pass = Boolean(c.expect(posture));
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"} — ${c.name} :: ${JSON.stringify({ ok: posture.ok, mode: posture.mode, enabled: posture.enabled })}`);
}

const body = "{\"type\":\"checkout.session.completed\"}";
const secret = "whsec_test_abc";
const { header } = sign(body, secret);
const good = verifyStripeWebhookSignature(body, header, secret);
const bad = verifyStripeWebhookSignature(body, header, "whsec_test_other");
const liveWh = verifyStripeWebhookSignature(body, header, "whsec_live_abc");
if (!good.ok) { failures += 1; console.log("FAIL — webhook verify good signature"); } else { console.log("PASS — webhook verify good signature"); }
if (bad.ok) { failures += 1; console.log("FAIL — webhook reject bad signature"); } else { console.log("PASS — webhook reject bad signature"); }
if (liveWh.ok) { failures += 1; console.log("FAIL — webhook refuse live secret"); } else { console.log("PASS — webhook refuse live secret"); }

if (failures) {
  console.error(`stripe-guard: ${failures} failure(s)`);
  process.exit(1);
}
console.log("stripe-guard: all checks passed");
