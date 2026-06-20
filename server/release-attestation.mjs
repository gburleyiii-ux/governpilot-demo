// GAGS SC-3 — signed/attested, reproducible release manifest.
//
// Produces a deterministic, signed manifest over a release's build artifacts so
// a release can be (a) verified for integrity (no artifact tampered with), (b)
// attested to its provenance (source commit, builder, build inputs), and (c)
// reproducibility-checked: the SAME artifact set always yields the SAME
// aggregate release hash, so an independent rebuild can be compared.
//
// Honest boundary: this attests artifact integrity + provenance and verifies a
// deterministic content hash. Bit-for-bit build reproducibility across differing
// toolchains is NOT asserted — only that a given artifact set hashes identically.

import { createHash, createHmac } from "node:crypto";
import { resolveSigningSecret, signatureModeFor } from "./signing-guard.mjs";

export const releaseManifestVersion = "governpilot-release-manifest/v1";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashArtifactContent(content) {
  return sha256(content);
}

// Deterministic aggregate hash: sort artifacts by path, join "path:sha256", hash.
// Order-independent and content-addressed, so two runs over the same artifact
// set always produce the same value.
export function computeAggregateHash(artifacts = []) {
  const lines = [...artifacts]
    .map((a) => `${a.path}:${a.sha256}`)
    .sort()
    .join("\n");
  return sha256(lines);
}

function canonicalBody(body) {
  // Stable stringify (sorted keys) so the signature is deterministic.
  const stable = (value) => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      return Object.keys(value)
        .sort()
        .reduce((acc, k) => {
          acc[k] = stable(value[k]);
          return acc;
        }, {});
    }
    return value;
  };
  return JSON.stringify(stable(body));
}

// Build a signed release manifest. `artifacts` is [{ path, sha256, bytes }].
export function buildReleaseManifest({
  version,
  commit = null,
  builder = "governpilot-ci",
  artifacts = [],
  buildInputs = {},
  generatedAt,
  env = process.env,
} = {}) {
  const normalizedArtifacts = artifacts
    .map((a) => ({ path: a.path, sha256: a.sha256, bytes: a.bytes ?? null }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const aggregateHash = computeAggregateHash(normalizedArtifacts);

  const body = {
    manifestVersion: releaseManifestVersion,
    release: { version: version || "0.0.0", commit, builder },
    generatedAt: generatedAt || null,
    buildInputs,
    artifactCount: normalizedArtifacts.length,
    artifacts: normalizedArtifacts,
    aggregateHash,
    attestation:
      "Signed artifact-integrity + provenance attestation. Aggregate hash is deterministic over the artifact set; an independent rebuild producing the same artifacts yields the same aggregate hash. Bit-for-bit cross-toolchain reproducibility is not asserted.",
  };

  const secret = resolveSigningSecret(env);
  const bodyHash = sha256(canonicalBody(body));
  const signature = createHmac("sha256", secret).update(bodyHash).digest("hex");

  return {
    ...body,
    integrity: {
      bodyHash,
      signature,
      signatureMode: signatureModeFor(env),
    },
  };
}

// Verify a manifest: recompute the aggregate hash from its artifacts, recompute
// the body hash + signature, and report each independently so tampering with an
// artifact, the aggregate hash, or the signature is all detectable.
export function verifyReleaseManifest(manifest, env = process.env) {
  if (!manifest || typeof manifest !== "object") {
    return { passed: false, reason: "manifest not an object" };
  }
  const { integrity, ...body } = manifest;
  const recomputedAggregate = computeAggregateHash(body.artifacts || []);
  const aggregateHashValid = recomputedAggregate === body.aggregateHash;

  const recomputedBodyHash = sha256(canonicalBody(body));
  const bodyHashValid = recomputedBodyHash === integrity?.bodyHash;

  const secret = resolveSigningSecret(env);
  const recomputedSignature = createHmac("sha256", secret)
    .update(integrity?.bodyHash || "")
    .digest("hex");
  const signatureValid = recomputedSignature === integrity?.signature;

  return {
    aggregateHashValid,
    bodyHashValid,
    signatureValid,
    passed: aggregateHashValid && bodyHashValid && signatureValid,
  };
}
