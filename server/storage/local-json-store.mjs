import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeState } from "./state-shape.mjs";

const defaultStateUrl = new URL("../../data/sentinelops-state.json", import.meta.url);
const defaultEvidenceUrl = new URL("../../data/evidence/", import.meta.url);

export function createLocalJsonStore() {
  const statePath = process.env.SENTINELOPS_LOCAL_STATE_PATH || fileURLToPath(defaultStateUrl);
  const evidencePath = process.env.SENTINELOPS_LOCAL_EVIDENCE_PATH || fileURLToPath(defaultEvidenceUrl);
  return {
    mode: "local-json",
    info() {
      return {
        mode: "local-json",
        path: statePath,
      };
    },
    async loadState() {
      try {
        const raw = await readFile(statePath, "utf8");
        return normalizeState(JSON.parse(raw));
      } catch (error) {
        if (error.code === "ENOENT") {
          return normalizeState();
        }
        throw error;
      }
    },
    async saveState(state) {
      await mkdir(dirname(statePath), { recursive: true });
      const tempPath = `${statePath}.tmp`;
      await writeFile(tempPath, `${JSON.stringify(normalizeState(state), null, 2)}\n`, "utf8");
      await rename(tempPath, statePath);
      return state;
    },
    async saveEvidencePacket(runId, packet) {
      await mkdir(evidencePath, { recursive: true });
      const packetPath = `${evidencePath}${runId}-evidence-packet.md`;
      await writeFile(packetPath, packet, "utf8");
      return {
        mode: "local-json",
        path: packetPath,
      };
    },
  };
}
