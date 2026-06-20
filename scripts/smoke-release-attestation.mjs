// Smoke for GAGS SC-3 — signed/attested, reproducible release manifest.
//
// Proves: deterministic aggregate hash (same artifacts -> same hash =
// reproducibility anchor), valid signature, and tamper detection on the
// artifact set, the aggregate hash, and the signature.

import {
  buildReleaseManifest,
  computeAggregateHash,
  hashArtifactContent,
  verifyReleaseManifest,
} from "../server/release-attestation.mjs";

const env = { ...process.env, SENTINELOPS_SIGNING_SECRET: "sentinelops-release-smoke-secret" };

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// Fixture artifact set (content hashed deterministically).
const fixture = [
  { path: "dist/index.html", content: "<!doctype html><title>GovernPilot</title>" },
  { path: "dist/assets/app.js", content: "console.log('governpilot');" },
  { path: "dist/assets/app.css", content: ":root{color:#111}" },
];
const artifacts = fixture.map((f) => ({ path: f.path, sha256: hashArtifactContent(f.content), bytes: f.content.length }));

const base = { version: "0.22.0", commit: "abc123", builder: "smoke", generatedAt: "2026-06-20T00:00:00.000Z", env };

// 1. Reproducibility: same artifact set -> identical aggregate hash, even if
// artifacts are presented in a different order.
const m1 = buildReleaseManifest({ ...base, artifacts });
const m2 = buildReleaseManifest({ ...base, artifacts: [...artifacts].reverse() });
check("aggregate hash is 64-hex", m1.aggregateHash.length === 64);
check("same artifact set -> same aggregate hash (reproducible, order-independent)", m1.aggregateHash === m2.aggregateHash);
check("manifest signature is 64-hex", m1.integrity.signature.length === 64);

// 2. A fresh, untampered manifest verifies.
const ok = verifyReleaseManifest(m1, env);
check("untampered manifest verifies (signature + hashes)", ok.passed, JSON.stringify(ok));

// 3. Tampering with an artifact hash is caught (aggregate no longer matches).
const tamperedArtifact = structuredClone(m1);
tamperedArtifact.artifacts[0].sha256 = "0".repeat(64);
const t1 = verifyReleaseManifest(tamperedArtifact, env);
check("artifact tamper detected (aggregate hash mismatch)", t1.aggregateHashValid === false && t1.passed === false);

// 4. Tampering with the stored aggregate hash is caught (body hash / signature).
const tamperedAggregate = structuredClone(m1);
tamperedAggregate.aggregateHash = "f".repeat(64);
const t2 = verifyReleaseManifest(tamperedAggregate, env);
check("aggregate-hash tamper detected", t2.passed === false);

// 5. Tampering with the signature is caught.
const tamperedSig = structuredClone(m1);
tamperedSig.integrity.signature = "a".repeat(64);
const t3 = verifyReleaseManifest(tamperedSig, env);
check("signature tamper detected", t3.signatureValid === false && t3.passed === false);

// 6. A different artifact set yields a different aggregate hash.
const altered = computeAggregateHash([...artifacts, { path: "dist/extra.txt", sha256: hashArtifactContent("x") }]);
check("different artifact set -> different aggregate hash", altered !== m1.aggregateHash);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
