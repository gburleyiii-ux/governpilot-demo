// GAGS Technology Compliance Kit (TCK) — implementation-independent runner.
//
// Usage:
//   node tck/run-tck.mjs --base-url http://host:port/api [--attestation path.json]
//                        [--tenant-a tenant-alpha --tenant-b tenant-bravo]
//                        [--out tck/tck-report.json]
//
// Exercises a CANDIDATE implementation's HTTP API to verify the black-box GAGS
// requirements (no source access), then merges an attestation manifest covering
// the requirements that are not observable over the wire. Emits a signed
// tck-report.json and exits non-zero if any black-box L1 MUST check fails or an
// attestation-class requirement is uncovered.
//
// This kit is self-contained: it imports nothing from the candidate's server, so
// it can be pointed at any GAGS implementation.

import { createHash, createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const profile = JSON.parse(readFileSync(join(here, "tck-profile.json"), "utf8"));

// ---- args ----------------------------------------------------------------
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const baseUrl = arg("base-url", "http://127.0.0.1:4175/api").replace(/\/$/, "");
const attestationPath = arg("attestation", null);
const tenantA = arg("tenant-a", "tenant-alpha");
const tenantB = arg("tenant-b", "tenant-bravo");
const outPath = arg("out", join(here, "tck-report.json"));

const responses = []; // all raw bodies, for the DP-2 secret scan

async function request(path, { method = "GET", role, reviewer, tenant, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (role) headers["x-sentinelops-role"] = role;
  if (reviewer) headers["x-sentinelops-reviewer"] = reviewer;
  if (tenant) headers["x-sentinelops-tenant"] = tenant;
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body });
  const raw = await res.text();
  responses.push(raw);
  let json = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { /* non-json */ }
  return { status: res.status, raw, json };
}

const is64hex = (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

// ---- shared fixtures (created once) --------------------------------------
const fixtures = {};
async function setup() {
  // Assessment run + approval (security-reviewer).
  const run = await request("/runs", { method: "POST", role: "security-reviewer", reviewer: "TCK", body: "{}" });
  fixtures.run = run.json?.run || null;
  if (fixtures.run) {
    fixtures.approval = await request(`/runs/${fixtures.run.id}/approval`, {
      method: "POST", role: "security-reviewer", reviewer: "TCK",
      body: JSON.stringify({ state: "approved", note: "TCK" }),
    });
  }
  // Health run + approval + evidence (security-reviewer).
  const hbody = JSON.stringify({
    segment: "provider",
    useCase: { notSignalOrImage: true, displaysMedicalInfo: true, recommendationsOnly: true, independentReview: true },
  });
  const hrun = await request("/health/runs", { method: "POST", role: "security-reviewer", reviewer: "TCK", body: hbody });
  fixtures.healthRun = hrun.json?.run || null;
  if (fixtures.healthRun) {
    await request(`/health/runs/${fixtures.healthRun.id}/approval`, {
      method: "POST", role: "security-reviewer", reviewer: "TCK",
      body: JSON.stringify({ state: "approved", note: "TCK" }),
    });
    fixtures.healthEvidence = await request(`/health/runs/${fixtures.healthRun.id}/evidence`, {
      role: "security-reviewer",
    });
  }
  // Tenant-scoped run for IA-4.
  fixtures.tenantRun = await request("/runs", { method: "POST", role: "security-reviewer", tenant: tenantA, body: "{}" });
}

// ---- black-box checks ----------------------------------------------------
const CHECKS = {
  "run-binding": async () => ({ pass: Boolean(fixtures.run?.id), detail: fixtures.run?.id || "no run id" }),
  "rbac-roles-declared": async () => {
    const r = await request("/rbac/roles");
    return { pass: Array.isArray(r.json?.roles) && r.json.roles.every((x) => Array.isArray(x.permissions)), detail: `${r.json?.roles?.length || 0} roles` };
  },
  "approval-before-write": async () => {
    const a = fixtures.approval;
    const ok = a?.status === 200 && /approv/i.test(JSON.stringify(a.json?.run?.approvalState || a.json?.run?.approvalGate?.state || ""));
    return { pass: ok, detail: `approval status ${a?.status}` };
  },
  "approval-signed": async () => {
    const sig = fixtures.approval?.json?.latestApproval?.signature || fixtures.approval?.json?.approval?.signature;
    return { pass: is64hex(sig), detail: sig ? "signed" : "no signature" };
  },
  "no-approval-escalation": async () => {
    const aud = await request(`/runs/${fixtures.run?.id}/approval`, { method: "POST", role: "auditor", body: JSON.stringify({ state: "approved" }) });
    const op = await request(`/runs/${fixtures.run?.id}/approval`, { method: "POST", role: "operator", body: JSON.stringify({ state: "approved" }) });
    return { pass: aud.status === 403 && op.status === 403, detail: `auditor ${aud.status}, operator ${op.status}` };
  },
  "policy-declarative": async () => {
    const r = await request("/policies/active");
    return { pass: Array.isArray(r.json?.rules) && r.json.rules.length > 0, detail: `${r.json?.rules?.length || 0} rules` };
  },
  "policy-rego-export": async () => {
    const r = await request("/policies/rego");
    const txt = JSON.stringify(r.json || "");
    return { pass: r.status === 200 && /package |rego|modules/i.test(txt), detail: `status ${r.status}` };
  },
  "evidence-content-addressed": async () => {
    const sha = fixtures.healthEvidence?.json?.packetSha256;
    return { pass: is64hex(sha), detail: sha ? "content-addressed" : "no packetSha256" };
  },
  "audit-export-gated": async () => {
    const allowed = await request("/audit/export", { role: "auditor" });
    const denied = await request("/audit/export", { role: "operator" });
    const hash = JSON.stringify(allowed.json || "").match(/[0-9a-f]{64}/);
    return { pass: allowed.status === 200 && Boolean(hash) && denied.status === 403, detail: `auditor ${allowed.status}, operator ${denied.status}` };
  },
  "default-deny": async () => {
    const r = await request("/runs", { method: "POST", role: "auditor", body: "{}" });
    return { pass: r.status === 403, detail: `auditor create-run ${r.status}` };
  },
  "tenant-isolation": async () => {
    const id = fixtures.tenantRun?.json?.run?.id;
    if (!id) return { pass: false, detail: "no tenant run created" };
    const cross = await request(`/runs/${id}/audit`, { tenant: tenantB });
    return { pass: cross.status === 404, detail: `cross-tenant read ${cross.status}` };
  },
  "data-boundary-declared": async () => {
    const r = await request("/data-protection");
    return { pass: r.status === 200 && r.json && typeof r.json === "object", detail: `status ${r.status}` };
  },
  "no-secrets-in-responses": async () => {
    const pattern = /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY|xoxb-[A-Za-z0-9-]{20,}|ghp_[A-Za-z0-9]{20,})/;
    const hit = responses.find((b) => pattern.test(b));
    return { pass: !hit, detail: hit ? "secret-like string in a response" : "clean" };
  },
  "observability-slos": async () => {
    const r = await request("/observability/summary");
    const txt = JSON.stringify(r.json || "");
    return { pass: r.status === 200 && /slo|health|alert/i.test(txt), detail: `status ${r.status}` };
  },
  "alert-dispatch-gated": async () => {
    const r = await request("/observability/alerts/dispatch", { method: "POST", role: "operator", body: "{}" });
    return { pass: r.status === 403, detail: `operator dispatch ${r.status}` };
  },
  "model-routing-posture": async () => {
    const r = await request("/model-gateway");
    const txt = JSON.stringify(r.json || "");
    return { pass: r.status === 200 && /provider|route|credential|secret/i.test(txt), detail: `status ${r.status}` };
  },
  "cost-guardrails": async () => {
    const r = await request("/model-gateway/cost-guardrails");
    const txt = JSON.stringify(r.json || "");
    return { pass: r.status === 200 && /budget|token|latency/i.test(txt), detail: `status ${r.status}` };
  },
  "tool-registry": async () => {
    const r = await request("/tools/registry");
    const tools = r.json?.tools || [];
    const ok = tools.length > 0 && tools.every((t) => t.writeScope && t.approvalClass);
    return { pass: ok, detail: `${tools.length} tools record write-scope + approval class` };
  },
  "health-run-loop": async () => {
    const ok = fixtures.healthRun?.id && fixtures.healthRun?.fdaRouting?.track && is64hex(fixtures.healthEvidence?.json?.packetSha256);
    return { pass: Boolean(ok), detail: ok ? `fda ${fixtures.healthRun.fdaRouting.track}` : "loop incomplete" };
  },
};

// ---- run -----------------------------------------------------------------
const attestation = attestationPath ? JSON.parse(readFileSync(attestationPath, "utf8")) : { attestations: {} };
const attestedMap = attestation.attestations || {};

await setup();

const results = [];
for (const req of profile.requirements) {
  if (req.class === "black-box") {
    const fn = CHECKS[req.check];
    let outcome;
    try {
      outcome = fn ? await fn() : { pass: false, detail: `no check impl for ${req.check}` };
    } catch (e) {
      outcome = { pass: false, detail: `check threw: ${e.message}` };
    }
    results.push({ id: req.id, level: req.level, must: req.must, class: req.class, status: outcome.pass ? "Pass" : "Fail", detail: outcome.detail });
  } else {
    const att = attestedMap[req.id];
    const covered = att && att.attested === true && typeof att.evidence === "string" && att.evidence.trim();
    results.push({ id: req.id, level: req.level, must: req.must, class: req.class, status: covered ? "Attested" : "Uncovered", detail: covered ? att.evidence : "no attestation supplied" });
  }
}

const blackBoxMustFails = results.filter((r) => r.class === "black-box" && r.must && r.status !== "Pass");
const uncoveredAttest = results.filter((r) => r.class === "attestation" && r.status !== "Attested");
const conformant = blackBoxMustFails.length === 0 && uncoveredAttest.length === 0;

const summary = {
  blackBox: { total: results.filter((r) => r.class === "black-box").length, pass: results.filter((r) => r.class === "black-box" && r.status === "Pass").length, mustFail: blackBoxMustFails.length },
  attestation: { total: results.filter((r) => r.class === "attestation").length, attested: results.filter((r) => r.status === "Attested").length, uncovered: uncoveredAttest.length },
  conformant,
};

const body = {
  tck: profile.tck,
  standard: profile.standard,
  version: profile.version,
  candidate: { baseUrl, attestationManifest: attestationPath || null, attestedBy: attestation.implementer || null },
  generatedBy: "tck/run-tck.mjs",
  results,
  summary,
  truthfulBoundary:
    "Black-box checks verify observable behavior over the candidate's API. Attestation-class requirements are implementer-declared with an evidence pointer; the TCK confirms coverage, not the attestation's truth. Independent assessment is a separate step.",
};

const secret = process.env.SENTINELOPS_SIGNING_SECRET || "gags-tck-dev-key";
const canonical = JSON.stringify(body);
const bodyHash = createHash("sha256").update(canonical).digest("hex");
const signature = createHmac("sha256", secret).update(bodyHash).digest("hex");
const report = { ...body, integrity: { bodyHash, signature, signatureMode: process.env.SENTINELOPS_SIGNING_SECRET ? "hmac-sha256" : "dev-hmac-sha256" } };

writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`GAGS TCK ${profile.version} against ${baseUrl}`);
for (const r of results) {
  const mark = r.status === "Pass" || r.status === "Attested" ? "OK  " : "MISS";
  console.log(`  [${mark}] ${r.id} (${r.level}${r.must ? " MUST" : ""}, ${r.class}) — ${r.status}${r.detail ? ` :: ${r.detail}` : ""}`);
}
console.log(`\nBlack-box: ${summary.blackBox.pass}/${summary.blackBox.total} pass (${summary.blackBox.mustFail} MUST fails)`);
console.log(`Attestation: ${summary.attestation.attested}/${summary.attestation.total} covered (${summary.attestation.uncovered} uncovered)`);
console.log(`TCK: ${conformant ? "CONFORMANT" : "NOT CONFORMANT"} — report: ${outPath}`);

if (!conformant) process.exit(1);
