import { readFile } from "node:fs/promises";
import { getAwsStoreConfig } from "../server/storage/aws-state-store.mjs";
import { getStorageInfo, loadState, saveEvidencePacket } from "../server/store.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const storage = getStorageInfo();
assert(storage.mode === "local-json", `expected local-json default storage, received ${storage.mode}`);

const state = await loadState();
assert(Array.isArray(state.runs), "expected state.runs to be an array");
assert(Array.isArray(state.approvals), "expected state.approvals to be an array");

const evidenceResult = await saveEvidencePacket("storage-smoke", "# Storage Smoke\n\nAdapter write check.\n");
assert(evidenceResult?.path?.endsWith("storage-smoke-evidence-packet.md"), "expected local evidence packet path");
const savedEvidence = await readFile(evidenceResult.path, "utf8");
assert(savedEvidence.includes("Adapter write check"), "expected saved evidence packet content");

process.env.SENTINELOPS_STATE_BUCKET = "sentinelops-evidence-example";
process.env.SENTINELOPS_STATE_KEY = "state/example.json";
process.env.SENTINELOPS_EVIDENCE_PREFIX = "evidence/example";
process.env.SENTINELOPS_APPROVAL_LEDGER_TABLE = "sentinelops-approval-ledger-example";
process.env.SENTINELOPS_AWS_REGION = "us-gov-west-1";

const awsConfig = getAwsStoreConfig();
assert(awsConfig.bucket === "sentinelops-evidence-example", "expected AWS state bucket to resolve from env");
assert(awsConfig.approvalLedgerTable === "sentinelops-approval-ledger-example", "expected AWS approval ledger table from env");
assert(awsConfig.evidencePrefix === "evidence/example", "expected AWS evidence prefix from env");

console.log(
  JSON.stringify(
    {
      defaultMode: storage.mode,
      localStatePath: storage.path,
      evidencePacketPath: evidenceResult.path,
      awsConfigValidated: true,
      awsRegion: awsConfig.region,
    },
    null,
    2,
  ),
);
