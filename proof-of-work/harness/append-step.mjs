// Append one existing-suite step to proof-of-work/logs/suite-steps.json.
// Invoked by run-all.sh. Exit status of the step is recorded; this process exits 0.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, relative } from "node:path";

const args = process.argv.slice(2);
const opt = {};
const command = [];
let afterDash = false;
for (let i = 0; i < args.length; i += 1) {
  const token = args[i];
  if (token === "--") {
    afterDash = true;
    command.push(...args.slice(i + 1));
    break;
  }
  if (!afterDash && token.startsWith("--")) {
    const key = token.slice(2);
    opt[key] = args[i + 1];
    i += 1;
  }
}

const stepsPath = new URL("../logs/suite-steps.json", import.meta.url);
const rawPath = stepsPath.pathname;
mkdirSync(dirname(rawPath), { recursive: true });

let steps = [];
try {
  steps = JSON.parse(readFileSync(rawPath, "utf8"));
  if (!Array.isArray(steps)) steps = [];
} catch {
  steps = [];
}

const exitCode = Number(opt.code);
const durationMs = Math.max(0, Number(opt["end-ms"]) - Number(opt["start-ms"]));
const logFile = opt.log && opt.cwd ? relative(opt.cwd, opt.log) : opt.log || null;

steps.push({
  id: opt.id,
  group: "existing-suite",
  command: command.join(" "),
  exitCode,
  status: exitCode === 0 ? "pass" : "fail",
  startedAt: opt.start,
  finishedAt: opt.finish,
  durationMs,
  logFile,
});

writeFileSync(rawPath, `${JSON.stringify(steps, null, 2)}\n`);
