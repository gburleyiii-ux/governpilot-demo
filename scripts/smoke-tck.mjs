// Self-test for the GAGS TCK: spawn the GovernPilot reference implementation,
// run the implementation-independent TCK against its live API with GovernPilot's
// attestation manifest, and assert it is TCK-CONFORMANT. Proves the kit works
// end-to-end and that the reference implementation passes its own open kit.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.SENTINELOPS_TCK_SMOKE_PORT || 4196);
const baseUrl = `http://127.0.0.1:${port}/api`;
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

let failures = 0;
function check(name, cond, detail = "") {
  if (!cond) failures += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// Wait for the server's "listening" log line BEFORE any fetch touches the
// origin — connecting before the listener is ready can poison undici's
// per-origin connection pool and wedge subsequent fetches. After the line
// appears, settle briefly then confirm with a health fetch (a few retries).
async function waitForHealth() {
  for (let i = 0; i < 120 && !logs.join("").includes("listening on"); i += 1) {
    await delay(100);
  }
  if (!logs.join("").includes("listening on")) {
    throw new Error(`TCK self-test server never logged "listening".\n${logs.join("")}`);
  }
  await delay(400);
  for (let i = 0; i < 20; i += 1) {
    try {
      const r = await fetch(`${baseUrl}/health`);
      if (r.ok) return;
    } catch { /* settle */ }
    await delay(250);
  }
  throw new Error(`TCK self-test server logged listening but health did not respond.\n${logs.join("")}`);
}

const stateDir = await mkdtemp(join(tmpdir(), "sentinelops-tck-smoke-"));
const reportPath = join(stateDir, "tck-report.json");

const server = spawn(process.execPath, ["server/index.mjs"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    // Override CI NODE_ENV=production so C1 local-dev can boot on loopback.
    NODE_ENV: "test",
    SENTINELOPS_AUTH_MODE: "local-dev",
    SENTINELOPS_SIGNING_SECRET: "sentinelops-tck-smoke-secret",
    SENTINELOPS_API_HOST: "127.0.0.1",
    SENTINELOPS_API_PORT: String(port),
    SENTINELOPS_LOCAL_STATE_PATH: join(stateDir, "state.json"),
    SENTINELOPS_LOCAL_EVIDENCE_PATH: join(stateDir, "evidence/"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const logs = [];
server.stdout.on("data", (c) => logs.push(c.toString()));
server.stderr.on("data", (c) => logs.push(c.toString()));

function runTck() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      "tck/run-tck.mjs",
      "--base-url", baseUrl,
      "--attestation", "tck/governpilot-attestation.json",
      "--out", reportPath,
    ], { cwd: projectRoot, env: { ...process.env, SENTINELOPS_SIGNING_SECRET: "sentinelops-tck-smoke-secret" }, stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    child.stdout.on("data", (c) => out.push(c.toString()));
    child.stderr.on("data", (c) => out.push(c.toString()));
    child.on("close", (code) => resolve({ code, out: out.join("") }));
  });
}

try {
  await waitForHealth();
  const { code, out } = await runTck();
  check("TCK runner exited 0 (conformant)", code === 0, `exit ${code}`);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  check("report marks candidate CONFORMANT", report.summary.conformant === true);
  check("zero black-box MUST failures", report.summary.blackBox.mustFail === 0, `${report.summary.blackBox.pass}/${report.summary.blackBox.total} pass`);
  check("zero uncovered attestation requirements", report.summary.attestation.uncovered === 0, `${report.summary.attestation.attested}/${report.summary.attestation.total} covered`);
  check("report is signed (64-hex)", /^[0-9a-f]{64}$/.test(report.integrity.signature));
  check("a representative black-box check ran (tenant-isolation)", report.results.some((r) => r.id === "IA-4" && r.status === "Pass"));
  if (failures > 0) console.log(out);
} catch (e) {
  failures += 1;
  console.log(`FAIL  TCK self-test threw — ${e.message}`);
  console.log(logs.join(""));
} finally {
  server.kill("SIGTERM");
  await delay(150);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
