// GAGS conformance driver.
//
// Reads standard/conformance-map.json, runs every mapped check, and emits a
// signed standard/conformance-report.json. Exits non-zero if any L1 MUST
// requirement fails — this is what CI (GAGS SC-1) gates on.
//
// Honesty rules baked in:
//  - A requirement is Pass only if every mapped check passes.
//  - "roadmap" checks are reported as Roadmap, never silently Pass.
//  - L2/L3 requirements are reported but do not gate the L1 build.

import { execSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { evaluateSigningPosture, DEV_SIGNING_KEY } from "../server/signing-guard.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const map = JSON.parse(readFileSync(join(root, "standard/conformance-map.json"), "utf8"));

// ---- check runners -------------------------------------------------------

const scriptCache = new Map();
function runScript(script) {
  if (scriptCache.has(script)) return scriptCache.get(script);
  let result;
  try {
    execSync(`npm run ${script} --silent`, { cwd: root, stdio: "ignore", timeout: 120000 });
    result = { pass: true };
  } catch (error) {
    result = { pass: false, detail: `script "${script}" exited non-zero` };
  }
  scriptCache.set(script, result);
  return result;
}

function ciWorkflowPresent() {
  const dir = join(root, ".github/workflows");
  if (!existsSync(dir)) return { pass: false, detail: ".github/workflows missing" };
  const files = readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  const gates = files.some((f) => readFileSync(join(dir, f), "utf8").includes("conformance"));
  return gates
    ? { pass: true }
    : { pass: false, detail: "no workflow runs the conformance suite" };
}

function secretScan() {
  // High-signal live-secret patterns in tracked source (excludes vendored deps and lockfile).
  const pattern = "(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY|xoxb-[A-Za-z0-9-]{20,}|ghp_[A-Za-z0-9]{20,})";
  let hits = "";
  try {
    hits = execSync(
      `git grep -nIE "${pattern}" -- . ':(exclude).venv/**' ':(exclude)node_modules/**' ':(exclude)package-lock.json' || true`,
      { cwd: root, encoding: "utf8", timeout: 60000 }
    );
  } catch {
    hits = "";
  }
  // Known benign fixture: the data-protection smoke test embeds a literal PEM
  // private-key header string to prove redaction. Its file is allow-listed below.
  const offending = hits
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("scripts/smoke-data-protection.mjs"));
  return offending.length === 0
    ? { pass: true }
    : { pass: false, detail: `possible secrets: ${offending.length} line(s)` };
}

function fileExists(path) {
  return existsSync(join(root, path)) ? { pass: true } : { pass: false, detail: `missing ${path}` };
}

function runCheck(check) {
  switch (check.type) {
    case "script":
      return runScript(check.script);
    case "internal":
      if (check.check === "ci-workflow-present") return ciWorkflowPresent();
      if (check.check === "secret-scan") return secretScan();
      if (check.check === "file-exists") return fileExists(check.path);
      return { pass: false, detail: `unknown internal check ${check.check}` };
    case "roadmap":
      return { roadmap: true };
    default:
      return { pass: false, detail: `unknown check type ${check.type}` };
  }
}

// ---- evaluate requirements ----------------------------------------------

const results = map.requirements.map((req) => {
  const checkResults = req.checks.map(runCheck);
  let status;
  if (checkResults.some((c) => c.roadmap)) {
    status = "Roadmap";
  } else if (checkResults.every((c) => c.pass)) {
    status = "Pass";
  } else {
    status = "Fail";
  }
  return {
    id: req.id,
    family: req.family,
    level: req.level,
    must: req.must,
    title: req.title,
    status,
    detail: checkResults.filter((c) => c.detail).map((c) => c.detail),
  };
});

// ---- rollups -------------------------------------------------------------

const byLevel = {};
for (const r of results) {
  const lvl = (byLevel[r.level] ||= { pass: 0, fail: 0, roadmap: 0, total: 0 });
  lvl.total += 1;
  if (r.status === "Pass") lvl.pass += 1;
  else if (r.status === "Fail") lvl.fail += 1;
  else lvl.roadmap += 1;
}

const l1Must = results.filter((r) => r.level === "L1" && r.must);
const l1MustPass = l1Must.filter((r) => r.status === "Pass").length;
const l1Conformant = l1Must.every((r) => r.status === "Pass");

// ---- sign report ---------------------------------------------------------

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const posture = evaluateSigningPosture(process.env);
const secret = process.env.SENTINELOPS_SIGNING_SECRET || DEV_SIGNING_KEY;

const reportBody = {
  standard: map.standard,
  standardTitle: map.title,
  standardVersion: map.version,
  generatedBy: "scripts/verify-conformance.mjs",
  claimedLevel: "L1",
  l1: { required: l1Must.length, passed: l1MustPass, conformant: l1Conformant },
  byLevel,
  requirements: results,
  truthfulBoundary:
    "Reference implementation runs on a local backend; tenant isolation (IA-4) is enforced and tested, while remaining L2/L3 items are roadmap. Conformance is self-asserted (not an independent assessment).",
};

const bodyHash = createHash("sha256").update(canonical(reportBody)).digest("hex");
const signature = createHmac("sha256", secret).update(bodyHash).digest("hex");

const report = {
  ...reportBody,
  integrity: {
    bodyHash,
    signature,
    signatureMode: posture.signatureMode,
  },
};

writeFileSync(join(root, "standard/conformance-report.json"), `${JSON.stringify(report, null, 2)}\n`);

// ---- console summary -----------------------------------------------------

console.log(`GAGS ${map.version} conformance`);
for (const r of results) {
  const mark = r.status === "Pass" ? "PASS" : r.status === "Fail" ? "FAIL" : "ROAD";
  console.log(`  [${mark}] ${r.id} (${r.level}${r.must ? " MUST" : ""}) — ${r.title}${r.detail.length ? ` :: ${r.detail.join("; ")}` : ""}`);
}
console.log(`\nL1 MUST: ${l1MustPass}/${l1Must.length} pass — ${l1Conformant ? "L1 CONFORMANT" : "NOT CONFORMANT"}`);
console.log(`Report: standard/conformance-report.json (signatures: ${posture.signatureMode})`);

if (!l1Conformant) {
  console.error("\nGAGS L1 conformance failed — blocking.");
  process.exit(1);
}
