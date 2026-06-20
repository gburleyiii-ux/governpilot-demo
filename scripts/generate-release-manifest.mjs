// Generate a signed, attested release manifest over the built dist/ artifacts
// (GAGS SC-3). Writes standard/release-manifest.json. Run after `npm run build`.

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { buildReleaseManifest, hashArtifactContent } from "../server/release-attestation.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

let files = [];
try {
  files = walk(distDir);
} catch {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}

const artifacts = files.map((file) => {
  const content = readFileSync(file);
  return {
    path: relative(root, file),
    sha256: hashArtifactContent(content),
    bytes: content.length,
  };
});

function git(cmd, fallback) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
}

const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const manifest = buildReleaseManifest({
  version,
  commit: git("git rev-parse HEAD", null),
  builder: process.env.SENTINELOPS_RELEASE_BUILDER || "local",
  artifacts,
  buildInputs: {
    node: process.version,
    branch: git("git rev-parse --abbrev-ref HEAD", null),
  },
  generatedAt: new Date().toISOString(),
});

writeFileSync(join(root, "standard/release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Release manifest: standard/release-manifest.json`);
console.log(`  version ${manifest.release.version}  artifacts ${manifest.artifactCount}  aggregate ${manifest.aggregateHash.slice(0, 16)}…`);
console.log(`  signature mode: ${manifest.integrity.signatureMode}`);
