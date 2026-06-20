// End-to-end smoke for GAGS IA-4 — multi-tenant isolation.
//
// Spawns the API server in a production-like posture (real signing secret so the
// AE-3 guard is satisfied) on an isolated temp state file, then proves that:
//   - a run created by tenant-alpha is invisible to tenant-bravo and to the
//     default tenant (404 on read / approve / evidence — never leaked),
//   - a tenant only ever sees its own runs in list/get,
//   - the signed health-run payload carries its tenantId (tamper-evident),
//   - an unknown tenant id is rejected (400),
// for BOTH the assessment-run loop and the persisted health-run loop.
//
// Prints PASS/FAIL per assertion and exits non-zero on any failure.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.SENTINELOPS_TENANCY_SMOKE_PORT || 4189);
const baseUrl = `http://127.0.0.1:${port}/api`;
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

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
      ...(options.tenant ? { "x-sentinelops-tenant": options.tenant } : {}),
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
  throw new Error("tenancy smoke server did not become healthy.");
}

const stateDir = await mkdtemp(join(tmpdir(), "sentinelops-tenancy-smoke-"));
const statePath = join(stateDir, "state.json");
const evidenceDir = join(stateDir, "evidence/");

const server = spawn(process.execPath, ["server/index.mjs"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: "production",
    SENTINELOPS_SIGNING_SECRET: "sentinelops-tenancy-smoke-signing-secret",
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

  // 0. Tenant registry endpoint + unknown-tenant rejection.
  const tenantsList = await request("/tenants", { tenant: "tenant-alpha" });
  check("tenants endpoint returns 200", tenantsList.status === 200, `status ${tenantsList.status}`);
  check("active tenant reflected", tenantsList.body?.activeTenant === "tenant-alpha");
  const unknown = await request("/tenants", { tenant: "tenant-zulu" });
  check("unknown tenant rejected (400)", unknown.status === 400, `status ${unknown.status}`);
  const malformed = await request("/tenants", { tenant: "Bad Tenant!" });
  check("malformed tenant rejected (400)", malformed.status === 400, `status ${malformed.status}`);

  // ---- Assessment-run loop ----------------------------------------------
  // 1. tenant-alpha creates a run; tenant-bravo creates its own.
  const alphaRun = await request("/runs", { method: "POST", role: "security-reviewer", tenant: "tenant-alpha", body: "{}" });
  check("alpha creates run (201)", alphaRun.status === 201, `status ${alphaRun.status}`);
  check("alpha run tagged with tenant", alphaRun.body?.run?.tenantId === "tenant-alpha", alphaRun.body?.run?.tenantId);
  const alphaRunId = alphaRun.body.run.id;

  const bravoRun = await request("/runs", { method: "POST", role: "security-reviewer", tenant: "tenant-bravo", body: "{}" });
  check("bravo creates run (201)", bravoRun.status === 201, `status ${bravoRun.status}`);

  // 2. Cross-tenant denial: bravo and default cannot touch alpha's run.
  const bravoReadsAlphaAudit = await request(`/runs/${alphaRunId}/audit`, { tenant: "tenant-bravo" });
  check("bravo CANNOT read alpha run audit (404)", bravoReadsAlphaAudit.status === 404, `status ${bravoReadsAlphaAudit.status}`);

  const bravoApprovesAlpha = await request(`/runs/${alphaRunId}/approval`, {
    method: "POST",
    role: "security-reviewer",
    tenant: "tenant-bravo",
    body: JSON.stringify({ state: "approved" }),
  });
  check("bravo CANNOT approve alpha run (404)", bravoApprovesAlpha.status === 404, `status ${bravoApprovesAlpha.status}`);

  const bravoExportsAlpha = await request(`/runs/${alphaRunId}/evidence`, { role: "security-reviewer", tenant: "tenant-bravo" });
  check("bravo CANNOT export alpha evidence (404)", bravoExportsAlpha.status === 404, `status ${bravoExportsAlpha.status}`);

  const defaultReadsAlpha = await request(`/runs/${alphaRunId}/audit`);
  check("default tenant CANNOT read alpha run (404)", defaultReadsAlpha.status === 404, `status ${defaultReadsAlpha.status}`);

  // 3. Same-tenant access still works.
  const alphaReadsOwn = await request(`/runs/${alphaRunId}/audit`, { tenant: "tenant-alpha" });
  check("alpha CAN read its own run audit (200)", alphaReadsOwn.status === 200, `status ${alphaReadsOwn.status}`);

  // ---- Health-run loop ---------------------------------------------------
  const healthBody = JSON.stringify({
    segment: "provider",
    useCase: { notSignalOrImage: true, displaysMedicalInfo: true, recommendationsOnly: true, independentReview: true },
  });
  const alphaHealth = await request("/health/runs", { method: "POST", role: "security-reviewer", tenant: "tenant-alpha", body: healthBody });
  check("alpha creates health run (201)", alphaHealth.status === 201, `status ${alphaHealth.status}`);
  check("alpha health run tagged with tenant (signed payload)", alphaHealth.body?.run?.tenantId === "tenant-alpha", alphaHealth.body?.run?.tenantId);
  const alphaHealthId = alphaHealth.body.run.id;

  const bravoGetsAlphaHealth = await request(`/health/runs/${alphaHealthId}`, { role: "security-reviewer", tenant: "tenant-bravo" });
  check("bravo CANNOT GET alpha health run (404)", bravoGetsAlphaHealth.status === 404, `status ${bravoGetsAlphaHealth.status}`);

  const bravoApprovesAlphaHealth = await request(`/health/runs/${alphaHealthId}/approval`, {
    method: "POST",
    role: "security-reviewer",
    tenant: "tenant-bravo",
    body: JSON.stringify({ state: "approved" }),
  });
  check("bravo CANNOT approve alpha health run (404)", bravoApprovesAlphaHealth.status === 404, `status ${bravoApprovesAlphaHealth.status}`);

  const bravoExportsAlphaHealth = await request(`/health/runs/${alphaHealthId}/evidence`, { role: "security-reviewer", tenant: "tenant-bravo" });
  check("bravo CANNOT export alpha health evidence (404)", bravoExportsAlphaHealth.status === 404, `status ${bravoExportsAlphaHealth.status}`);

  // 4. List endpoints are tenant-scoped.
  const bravoList = await request("/health/runs", { role: "security-reviewer", tenant: "tenant-bravo" });
  check("bravo health list excludes alpha run", !bravoList.body?.runs?.some((r) => r.id === alphaHealthId));
  const alphaList = await request("/health/runs", { role: "security-reviewer", tenant: "tenant-alpha" });
  check("alpha health list includes its own run", alphaList.body?.runs?.some((r) => r.id === alphaHealthId));

  // 5. Persistence: on-disk health run carries its tenantId.
  const persisted = JSON.parse(await readFile(statePath, "utf8"));
  const persistedAlpha = persisted.healthRuns?.find((r) => r.id === alphaHealthId);
  check("alpha health run persisted with tenantId", persistedAlpha?.tenantId === "tenant-alpha", persistedAlpha?.tenantId);
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
