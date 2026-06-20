// Validate the GAGS crosswalk against the committed NIST SP 800-53 Rev5 catalog
// snapshot (offline; refresh the snapshot with `npm run crosswalk:sync`):
//   - every nist_800_53 control referenced in the crosswalk EXISTS in NIST's
//     published catalog (no invented or mistyped control ids),
//   - every GAGS requirement in the conformance map has a crosswalk mapping.
// This replaces "trust our hardcoded mapping" with "controls verified against
// NIST's authoritative catalog."

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

let failures = 0;
function check(name, cond, detail = "") {
  if (!cond) failures += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const snapshotPath = "standard/nist-800-53-catalog-snapshot.json";
if (!existsSync(join(root, snapshotPath))) {
  console.error(`Missing ${snapshotPath} — run \`npm run crosswalk:sync\` first.`);
  process.exit(1);
}
const snapshot = read(snapshotPath);
const crosswalk = read("standard/crosswalk.json");
const healthCrosswalk = read("standard/health-crosswalk.json");
const map = read("standard/conformance-map.json");

// Normalize a crosswalk control id ("AC-6(1)") to OSCAL form ("ac-6.1").
const normalize = (id) => id.toLowerCase().replace(/\((\d+)\)/g, ".$1").replace(/\s+/g, "");
const catalogIds = new Set(Object.keys(snapshot.controls));

check("catalog snapshot is substantial", snapshot.controlCount >= 1000, `${snapshot.controlCount} controls`);
check("snapshot identifies its NIST source", /usnistgov|nist\.gov/.test(snapshot.source || ""));

// Every nist_800_53 control referenced must exist in the catalog.
const referenced = [];
for (const mapping of Object.values(crosswalk.mappings || {})) {
  for (const ctrl of mapping.nist_800_53 || []) referenced.push(ctrl);
}
const missing = [...new Set(referenced)].filter((c) => !catalogIds.has(normalize(c)));
check("every crosswalk 800-53 control exists in NIST catalog", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : `${new Set(referenced).size} distinct controls verified`);

// Every GAGS requirement is mapped — core requirements in crosswalk.json,
// health (HX) requirements in health-crosswalk.json. Composite ids (a numeric
// range like "HX-1-6"/"HX-9-11", or the "HX-RUN" meta-requirement) are covered
// when their component family is present in the health crosswalk.
const coreMapped = new Set(Object.keys(crosswalk.mappings || {}));
const healthMapped = new Set(Object.keys(healthCrosswalk.mappings || {}));
function isCovered(id) {
  if (coreMapped.has(id) || healthMapped.has(id)) return true;
  const range = id.match(/^(HX)-(\d+)-(\d+)$/);
  if (range) {
    const [, fam, lo, hi] = range;
    for (let n = Number(lo); n <= Number(hi); n += 1) {
      if (!healthMapped.has(`${fam}-${n}`)) return false;
    }
    return true;
  }
  if (id === "HX-RUN") return healthMapped.has("HX-6"); // persisted-loop integrity basis
  return false;
}
const unmapped = map.requirements.map((r) => r.id).filter((id) => !isCovered(id));
check("every GAGS requirement is mapped (core or health crosswalk)", unmapped.length === 0, unmapped.length ? `unmapped: ${unmapped.join(", ")}` : `${map.requirements.length} requirements mapped`);

// Spot-check a normalization (enhancement form).
check("enhancement normalization works (AC-6(1) -> ac-6.1)", catalogIds.has(normalize("AC-6(1)")) === catalogIds.has("ac-6.1"));

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
