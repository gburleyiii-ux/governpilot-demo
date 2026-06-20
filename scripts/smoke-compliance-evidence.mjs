// Smoke for the GAGS compliance-evidence generator. Validates the builder logic
// against the live conformance map/report/crosswalk: every NIST control maps to
// >=1 GAGS requirement with a known status, the POA&M reflects the report, and
// the con-mon plan covers every requirement. Also confirms the generated docs
// exist and are non-empty (drift-aware: regenerate via npm run compliance:generate).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildControlImplementations,
  buildPoam,
  buildContinuousMonitoringPlan,
  DEFAULT_AUTHORIZATION_GAPS,
} from "../server/compliance-evidence.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const map = read("standard/conformance-map.json");
const report = read("standard/conformance-report.json");
const crosswalk = read("standard/crosswalk.json");

let failures = 0;
function check(name, cond, detail = "") {
  if (!cond) failures += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const controls = buildControlImplementations(map, report, crosswalk);
check("SSP covers NIST 800-53 controls", controls.length > 0, `${controls.length} controls`);
check("every control maps to >=1 GAGS requirement", controls.every((c) => c.requirements.length > 0));
check("every mapped requirement has a known status", controls.every((c) => c.requirements.every((r) => r.status !== "Unknown")));
check("a representative control resolves (AC-3 from HA-1)", controls.some((c) => c.control === "AC-3" && c.requirements.some((r) => r.id === "HA-1")));
check("implemented flag reflects all-pass", controls.every((c) => c.implemented === c.requirements.every((r) => r.status === "Pass")));

const poam = buildPoam(report, DEFAULT_AUTHORIZATION_GAPS);
const reportOpen = report.requirements.filter((r) => r.status !== "Pass").length;
check("POA&M open-conformance-findings matches report", poam.openConformanceFindings === reportOpen, `${poam.openConformanceFindings} vs ${reportOpen}`);
check("POA&M includes external authorization gaps (3PAO/sponsor)", poam.entries.some((e) => e.external && /3PAO/i.test(e.item)));

const conmon = buildContinuousMonitoringPlan(map);
check("con-mon plan covers every requirement", conmon.items.length === map.requirements.length, `${conmon.items.length}/${map.requirements.length}`);
check("MUST requirements are build-gating in con-mon", conmon.items.filter((i) => i.must).every((i) => /gating/i.test(i.cadence)));

for (const f of ["docs/compliance/SSP_CONTROL_IMPLEMENTATIONS.md", "docs/compliance/POAM.md", "docs/compliance/CONTINUOUS_MONITORING_PLAN.md", "standard/control-implementation.json"]) {
  check(`generated artifact present: ${f}`, existsSync(join(root, f)) && readFileSync(join(root, f), "utf8").length > 100);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
