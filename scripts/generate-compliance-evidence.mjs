// Generate GAGS compliance evidence (SSP control-implementation statements,
// POA&M, continuous-monitoring plan) from the conformance map + report +
// crosswalk. Writes to docs/compliance/. Run after `npm run conformance`.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildControlImplementations,
  buildPoam,
  buildContinuousMonitoringPlan,
  renderSspMarkdown,
  renderPoamMarkdown,
  renderConMonMarkdown,
  DEFAULT_AUTHORIZATION_GAPS,
} from "../server/compliance-evidence.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const map = read("standard/conformance-map.json");
const report = read("standard/conformance-report.json");
const crosswalk = read("standard/crosswalk.json");
const meta = { standard: map.standard, version: map.version };

const controls = buildControlImplementations(map, report, crosswalk);
const poam = buildPoam(report, DEFAULT_AUTHORIZATION_GAPS);
const conmon = buildContinuousMonitoringPlan(map);

const outDir = join(root, "docs/compliance");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "SSP_CONTROL_IMPLEMENTATIONS.md"), `${renderSspMarkdown(controls, meta)}\n`);
writeFileSync(join(outDir, "POAM.md"), `${renderPoamMarkdown(poam, meta)}\n`);
writeFileSync(join(outDir, "CONTINUOUS_MONITORING_PLAN.md"), `${renderConMonMarkdown(conmon, meta)}\n`);
// Machine-readable SSP data for downstream tooling (OSCAL-adjacent).
writeFileSync(
  join(root, "standard/control-implementation.json"),
  `${JSON.stringify({ standard: meta.standard, version: meta.version, controls, poam, conmonItemCount: conmon.items.length }, null, 2)}\n`,
);

console.log(`Compliance evidence generated:`);
console.log(`  docs/compliance/SSP_CONTROL_IMPLEMENTATIONS.md (${controls.length} NIST 800-53 controls)`);
console.log(`  docs/compliance/POAM.md (${poam.entries.length} entries, ${poam.openConformanceFindings} open conformance findings)`);
console.log(`  docs/compliance/CONTINUOUS_MONITORING_PLAN.md (${conmon.items.length} monitored requirements)`);
console.log(`  standard/control-implementation.json`);
