// Sync the official NIST SP 800-53 Rev5 control catalog (NIST's published OSCAL
// content) into a committed snapshot, so the GAGS crosswalk can be VALIDATED
// against the authoritative control set rather than asserted. Network is used
// here, NOT in the gated conformance suite — the committed snapshot is what the
// crosswalk:check verifier consumes offline.
//
// Source: usnistgov/oscal-content (NIST's official OSCAL repository).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE =
  "https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json";

function collectControls(catalog) {
  const out = {};
  const walk = (group) => {
    for (const c of group.controls || []) {
      const title = (c.title || "").trim();
      out[c.id] = title;
      for (const sub of c.controls || []) out[sub.id] = (sub.title || "").trim();
    }
    for (const g of group.groups || []) walk(g);
  };
  for (const g of catalog.groups || []) walk(g);
  return out;
}

try {
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`source returned ${res.status}`);
  const doc = await res.json();
  const controls = collectControls(doc.catalog || {});
  const count = Object.keys(controls).length;
  if (count < 500) throw new Error(`only ${count} controls parsed — refusing to write a partial snapshot`);

  const snapshot = {
    catalog: "NIST SP 800-53 Rev5",
    source: SOURCE,
    oscalVersion: doc.catalog?.metadata?.["oscal-version"] || null,
    catalogVersion: doc.catalog?.metadata?.version || null,
    syncedAtNote: "Snapshot of control IDs/titles; refresh with `npm run crosswalk:sync`.",
    controlCount: count,
    controls,
  };
  writeFileSync(join(root, "standard/nist-800-53-catalog-snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Synced NIST SP 800-53 Rev5 catalog: ${count} controls -> standard/nist-800-53-catalog-snapshot.json`);
  console.log(`  catalog version: ${snapshot.catalogVersion} (OSCAL ${snapshot.oscalVersion})`);
} catch (e) {
  console.error(`CPRT sync failed (network or source issue): ${e.message}`);
  console.error("The committed snapshot (if present) is unchanged; crosswalk:check still runs offline.");
  process.exit(1);
}
