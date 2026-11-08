// Merge the existing-suite log and the adversarial harness into results.json,
// then write a SHA-256 manifest of those result files.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { relative, join } from "node:path";
import { spawnSync } from "node:child_process";

const powDir = new URL("..", import.meta.url);
const rootDir = new URL("../..", import.meta.url);
const powPath = powDir.pathname;
const rootPath = rootDir.pathname;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const meta = readJson(new URL("../logs/run-meta.json", import.meta.url));
const suite = readJson(new URL("../logs/suite-steps.json", import.meta.url));
const adversarial = readJson(new URL("../logs/adversarial.json", import.meta.url));

const tests = [
  ...suite.map((step) => ({
    id: step.id,
    group: "existing-suite",
    claim: `CI-equivalent step \`${step.command}\` exits 0`,
    status: step.status,
    exitCode: step.exitCode,
    durationMs: step.durationMs,
    startedAt: step.startedAt,
    finishedAt: step.finishedAt,
    command: step.command,
    logFile: step.logFile,
    detail:
      step.status === "pass"
        ? "Exit 0. Full output is in the log file."
        : `Exit ${step.exitCode}. See ${step.logFile}.`,
  })),
  ...adversarial.tests,
];

function count(list) {
  return {
    pass: list.filter((item) => item.status === "pass").length,
    fail: list.filter((item) => item.status === "fail").length,
    unsupported: list.filter((item) => item.status === "unsupported").length,
    total: list.length,
  };
}

const findings = tests
  .filter((item) => item.status !== "pass")
  .map((item) => ({
    id: item.id,
    group: item.group,
    status: item.status,
    claim: item.claim,
    detail: item.detail,
  }));

const results = {
  product: "GovernPilot (package name sentinelops-ai)",
  productVersion: "0.22.0",
  pinnedProductCommit: meta.pinnedProductCommit,
  headAtRun: meta.headAtRun,
  productTreeMatchesPin: meta.productTreeMatchesPin,
  node: meta.node,
  npm: meta.npm,
  platform: meta.platform,
  ciNodePin: meta.ciNodePin,
  ciNodeNote:
    "The GitHub workflow .github/workflows/conformance.yml pins Node 20. This run used the Node binary on PATH and records that version. It does not claim to have reproduced the CI runner image.",
  startedAt: meta.startedAt,
  finishedAt: new Date().toISOString(),
  summary: {
    all: count(tests),
    existingSuite: count(tests.filter((item) => item.group === "existing-suite")),
    adversarial: count(tests.filter((item) => item.group === "adversarial")),
  },
  findings,
  demo: adversarial.demo,
  tests,
  manifest: {
    file: "manifest.sha256",
    algorithm: "sha256",
    covers: ["results.json", "logs/**"],
    note: "The manifest is computed after results.json is written. It does not hash itself, demo.html, or REPORT.md.",
  },
};

const resultsPath = new URL("../results.json", import.meta.url);
writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`);

const inject = spawnSync(process.execPath, [new URL("./inject-demo.mjs", import.meta.url).pathname], {
  cwd: rootPath,
  stdio: "inherit",
});
if (inject.status !== 0) {
  process.exit(inject.status || 1);
}

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const files = [new URL("../results.json", import.meta.url).pathname, ...walk(new URL("../logs", import.meta.url).pathname, [])]
  .map((full) => relative(powPath, full))
  .filter((rel) => rel !== "manifest.sha256")
  .sort();

const lines = files.map((rel) => {
  const hash = createHash("sha256").update(readFileSync(join(powPath, rel))).digest("hex");
  return `${hash}  ${rel}`;
});
writeFileSync(new URL("../manifest.sha256", import.meta.url), `${lines.join("\n")}\n`);
console.log(
  JSON.stringify(
    {
      summary: results.summary,
      findings: findings.map((item) => `${item.status} ${item.id}`),
      manifestEntries: lines.length,
    },
    null,
    2,
  ),
);
