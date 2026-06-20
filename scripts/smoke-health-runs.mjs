// End-to-end smoke for the GAGS-HEALTH run lifecycle.
//
// Spawns the API server in a production-like posture (with SENTINELOPS_SIGNING_SECRET
// so the AE-3 signing guard is satisfied), then exercises the full lifecycle:
//   create -> RBAC deny/allow on approval -> approve -> evidence -> persistence reload.
//
// Prints PASS/FAIL per assertion and exits non-zero on any failure.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.SENTINELOPS_HEALTH_SMOKE_PORT || 4188);
const baseUrl = `http://127.0.0.1:${port}/api`;
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

// Sample identifier strings that the de-id evaluator detects as RESIDUAL
// categories. The intake boundary permits these (they are not in its hard-block
// set), so they reach the de-id evaluator — which must record only the CATEGORY,
// never the raw value. These literal values MUST NOT survive into state or any
// response.
const PHI_NEEDLES = [
  "clinic.intake@example.org", // email address category
  "https://portal.example.com/chart/8841", // URL category
  "90210", // geographic subdivision (ZIP) category
];
// A raw-PHI sample (real SSN + phone) that the HTTP intake boundary must HARD
// BLOCK (422) before it can ever be persisted — the strongest no-PHI guarantee.
const RAW_PHI_SAMPLE = "Patient SSN 123-45-6789, call 555-867-5309 for results.";

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.role ? { "x-sentinelops-role": options.role } : {}),
      ...(options.reviewer ? { "x-sentinelops-reviewer": options.reviewer } : {}),
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";
  return {
    status: response.status,
    raw,
    body: contentType.includes("json") && raw ? JSON.parse(raw) : raw,
  };
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const health = await request("/health");
      if (health.status === 200) return health.body;
    } catch {
      // not ready yet
    }
    await delay(250);
  }
  throw new Error("health-runs smoke server did not become healthy.");
}

// Isolate state on a fresh temp file so persistence assertions are deterministic
// and the shared dev state file is never mutated by the smoke test.
const stateDir = await mkdtemp(join(tmpdir(), "sentinelops-health-smoke-"));
const statePath = join(stateDir, "state.json");
const evidenceDir = join(stateDir, "evidence/");

const server = spawn(process.execPath, ["server/index.mjs"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    // Production-like posture so the AE-3 guard requires the real signing secret.
    NODE_ENV: "production",
    SENTINELOPS_SIGNING_SECRET: "sentinelops-health-smoke-signing-secret",
    SENTINELOPS_API_HOST: "127.0.0.1",
    SENTINELOPS_API_PORT: String(port),
    SENTINELOPS_LOCAL_STATE_PATH: statePath,
    SENTINELOPS_LOCAL_EVIDENCE_PATH: evidenceDir,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const logs = [];
server.stdout.on("data", (chunk) => logs.push(chunk.toString()));
server.stderr.on("data", (chunk) => logs.push(chunk.toString()));

try {
  await waitForHealth();

  // 0. HTTP intake boundary HARD-BLOCKS a raw-PHI sample (SSN/phone) at 422 before
  // anything can be persisted — the strongest no-PHI-persistence guarantee.
  const rawPhiBlocked = await request("/health/runs", {
    method: "POST",
    role: "security-reviewer",
    body: JSON.stringify({
      segment: "provider",
      useCase: { notSignalOrImage: true, displaysMedicalInfo: true, recommendationsOnly: true, independentReview: true },
      deidentification: { method: "safe-harbor", sample: RAW_PHI_SAMPLE },
    }),
  });
  check("raw-PHI sample HARD-BLOCKED at intake (422)", rawPhiBlocked.status === 422, `status ${rawPhiBlocked.status}`);
  check("intake-block response carries no raw SSN value", !rawPhiBlocked.raw.includes("123-45-6789"));

  // 1. Create a health run (FDA criteria booleans + a de-id sample with residual,
  // non-hard-blocked identifiers the de-id evaluator must flag by CATEGORY only).
  const createBody = {
    segment: "provider",
    useCase: {
      notSignalOrImage: true,
      displaysMedicalInfo: true,
      recommendationsOnly: true,
      independentReview: true,
    },
    deidentification: {
      method: "safe-harbor",
      sample:
        "Follow-up: email clinic.intake@example.org, portal https://portal.example.com/chart/8841, ZIP 90210.",
    },
  };
  const created = await request("/health/runs", {
    method: "POST",
    role: "security-reviewer",
    reviewer: "Grant Burley III",
    body: JSON.stringify(createBody),
  });
  check("create returns 201", created.status === 201, `status ${created.status}`);
  const run = created.body.run;
  check("run persisted with id", Boolean(run && run.id), run?.id);
  check("FDA routing present", Boolean(run?.fdaRouting?.track), run?.fdaRouting?.track);
  check(
    "de-identification evaluated (result present)",
    run?.deidentification?.provided === true && typeof run?.deidentification?.passed === "boolean",
    `passed=${run?.deidentification?.passed}`,
  );
  check(
    "de-id residual categories detected (email/URL/geo), CATEGORY only — no raw values",
    Array.isArray(run?.deidentification?.residualDetectedCategories) &&
      run.deidentification.residualDetectedCategories.includes("email addresses"),
    run?.deidentification?.residualDetectedCategories?.join(", "),
  );
  check("run record signed", typeof run?.signature === "string" && run.signature.length === 64);
  const createHasPhi = PHI_NEEDLES.some((needle) => created.raw.includes(needle));
  check("NO raw de-id sample echoed in create response", !createHasPhi);

  const runId = run.id;

  // 2. RBAC: auditor and operator must be DENIED approval; security-reviewer allowed.
  const auditorApproval = await request(`/health/runs/${runId}/approval`, {
    method: "POST",
    role: "auditor",
    body: JSON.stringify({ state: "approved" }),
  });
  check("auditor approval DENIED (403)", auditorApproval.status === 403, `status ${auditorApproval.status}`);

  const operatorApproval = await request(`/health/runs/${runId}/approval`, {
    method: "POST",
    role: "operator",
    body: JSON.stringify({ state: "approved" }),
  });
  check("operator approval DENIED (403)", operatorApproval.status === 403, `status ${operatorApproval.status}`);

  // 3. Approve the gate as security-reviewer; assert signed + ledger integrity.
  const approved = await request(`/health/runs/${runId}/approval`, {
    method: "POST",
    role: "security-reviewer",
    reviewer: "Grant Burley III",
    body: JSON.stringify({ state: "approved", note: "Approved for controlled health pilot." }),
  });
  check("security-reviewer approval ALLOWED (200)", approved.status === 200, `status ${approved.status}`);
  check(
    "approval signed (64-hex signature)",
    typeof approved.body?.approval?.signature === "string" && approved.body.approval.signature.length === 64,
  );
  check("approval ledger integrity passes", approved.body?.approvalLedger?.passed === true);
  check("run approvalState now approved", approved.body?.run?.approvalState === "approved");

  // 4. Evidence packet: hashed, maps HIPAA + FDA, no PHI.
  const evidence = await request(`/health/runs/${runId}/evidence`, {
    method: "GET",
    role: "security-reviewer",
  });
  check("evidence returns 200", evidence.status === 200, `status ${evidence.status}`);
  check(
    "evidence content-addressed (64-hex sha256)",
    typeof evidence.body?.packetSha256 === "string" && evidence.body.packetSha256.length === 64,
  );
  check("evidence maps HIPAA controls", Array.isArray(evidence.body?.hipaa?.controls) && evidence.body.hipaa.controls.length > 0);
  check("evidence maps FDA track", Boolean(evidence.body?.fda?.track), evidence.body?.fda?.track);
  check("evidence embeds passing approval ledger", evidence.body?.approvalLedger?.passed === true);
  const evidenceHasPhi = PHI_NEEDLES.some((needle) => evidence.raw.includes(needle));
  check("NO PHI in evidence packet", !evidenceHasPhi);

  // Evidence-export RBAC: operator (no exportEvidence) must be blocked.
  const operatorEvidence = await request(`/health/runs/${runId}/evidence`, { method: "GET", role: "operator" });
  check("operator evidence export DENIED (403)", operatorEvidence.status === 403, `status ${operatorEvidence.status}`);

  // 5. Persistence: read the state file directly from disk and confirm the run +
  // approval persisted, and that the raw PHI sample is absent from the on-disk state.
  const persistedRaw = await readFile(statePath, "utf8");
  const persisted = JSON.parse(persistedRaw);
  check(
    "health run PERSISTED to disk state",
    Array.isArray(persisted.healthRuns) && persisted.healthRuns.some((r) => r.id === runId),
  );
  check(
    "health approval PERSISTED to disk state",
    Array.isArray(persisted.healthApprovals) && persisted.healthApprovals.some((a) => a.runId === runId),
  );
  const diskHasPhi = PHI_NEEDLES.some((needle) => persistedRaw.includes(needle));
  check("NO raw de-id sample persisted on disk", !diskHasPhi);

  // 6. Fresh read-back through the API (proves persistence across a new loadState).
  const reread = await request(`/health/runs/${runId}`, { method: "GET", role: "security-reviewer" });
  check("run survives fresh loadState (GET 200)", reread.status === 200, `status ${reread.status}`);
  check("re-read run id matches", reread.body?.run?.id === runId);
  check("re-read approvals chain intact", reread.body?.approvalLedger?.passed === true);
} catch (error) {
  failures += 1;
  console.log(`FAIL  smoke harness threw — ${error.message}`);
  console.log(logs.join(""));
} finally {
  server.kill("SIGTERM");
  await delay(150);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
