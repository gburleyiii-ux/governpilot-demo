// Median timing for a 10,000-record approval ledger. Used by the adversarial
// harness and, optionally, a second Node binary. Both must call this function
// so the method does not drift.
import { arch, cpus, platform, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { signApprovalPayload, verifyApprovalLedger } from "../../server/audit-integrity.mjs";
import { signatureModeFor } from "../../server/signing-guard.mjs";

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildChain(count, label, env = process.env) {
  const oldestFirst = [];
  let previous = null;
  for (let i = 0; i < count; i += 1) {
    const entry = {
      id: `${label}-${String(i).padStart(5, "0")}`,
      runId: `run-${label}-${i}`,
      gateId: "gate-api-action-group",
      traceId: `trace-${label}-${i}`,
      state: "approved",
      reviewer: "Security Reviewer",
      reviewerRole: "security-reviewer",
      note: `${label} entry ${i}`,
      decidedAt: "2026-11-08T15:00:00.000Z",
      policyStatus: "pass",
      previousHash: previous,
      signatureMode: signatureModeFor(env),
    };
    entry.signature = signApprovalPayload(entry, previous, env);
    oldestFirst.push(entry);
    previous = entry.signature;
  }
  return oldestFirst.reverse();
}

export async function measureTenThousand() {
  const entries = 10000;
  const sampleCount = 7;
  const warmupRunsDiscarded = 1;
  for (let i = 0; i < warmupRunsDiscarded; i += 1) {
    verifyApprovalLedger(buildChain(entries, "volume-warmup"));
  }
  const buildSamples = [];
  const verifySamples = [];
  let lastChain = null;
  let lastLedger = null;
  for (let i = 0; i < sampleCount; i += 1) {
    const buildStarted = performance.now();
    const chain = buildChain(entries, `volume-${i}`);
    const buildElapsed = performance.now() - buildStarted;
    const verifyStarted = performance.now();
    const ledger = verifyApprovalLedger(chain);
    const verifyElapsed = performance.now() - verifyStarted;
    buildSamples.push(buildElapsed);
    verifySamples.push(verifyElapsed);
    lastChain = chain;
    lastLedger = ledger;
  }
  const tampered = structuredClone(lastChain);
  tampered[5000].note = "tampered during volume check";
  const tamperedLedger = verifyApprovalLedger(tampered);
  const medianBuild = median(buildSamples);
  const medianVerify = median(verifySamples);
  const buildMs = Math.round(medianBuild);
  const verifyMs = Math.round(medianVerify);
  const cpuModel = cpus()[0]?.model || "unknown";
  const measurement = {
    method: "median",
    clock: "performance.now()",
    entries,
    sampleCount,
    warmupRunsDiscarded,
    buildSamplesMs: buildSamples.map(round3),
    verifySamplesMs: verifySamples.map(round3),
    medianBuildMs: round3(medianBuild),
    medianVerifyMs: round3(medianVerify),
    reportedBuildMs: buildMs,
    reportedVerifyMs: verifyMs,
    node: process.version,
    platform: `${platform()} ${arch()}`,
    osRelease: release(),
    cpuModel,
    cpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    summary: `Median of ${sampleCount} runs after ${warmupRunsDiscarded} discarded warmup. Clock performance.now(). Node ${process.version}.`,
  };
  return {
    entries,
    buildMs,
    verifyMs,
    verifyEntriesPerSecond: verifyMs > 0 ? Math.round(entries / (verifyMs / 1000)) : null,
    cleanPassed: lastLedger.passed === true && lastLedger.total === entries,
    tamperedIndex: 5000,
    tamperDetected: tamperedLedger.passed === false,
    signatureMode: signatureModeFor(),
    measurement,
  };
}
