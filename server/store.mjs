import { createAwsStateStore } from "./storage/aws-state-store.mjs";
import { createLocalJsonStore } from "./storage/local-json-store.mjs";

function createStore() {
  if (process.env.SENTINELOPS_STORAGE_ADAPTER === "aws") {
    return createAwsStateStore();
  }
  return createLocalJsonStore();
}

const store = createStore();

export async function loadState() {
  return store.loadState();
}

export async function saveState(state, context = {}) {
  return store.saveState(state, context);
}

export async function updateState(mutator) {
  const state = await loadState();
  const previousState = structuredClone(state);
  const result = await mutator(state);
  await saveState(state, { previousState });
  return result;
}

export async function saveEvidencePacket(runId, packet) {
  if (typeof store.saveEvidencePacket !== "function") {
    return null;
  }
  return store.saveEvidencePacket(runId, packet);
}

export function getStorageInfo() {
  return store.info();
}

export function getStorageMode() {
  return store.mode;
}

export function getStatePath() {
  return store.info().path;
}
