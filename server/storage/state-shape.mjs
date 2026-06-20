export const emptyState = {
  sequence: 0,
  runs: [],
  approvals: [],
  policyChecks: [],
  agentReviews: [],
  alertDispatches: [],
  liveDeliveryExecutions: [],
  auditEvents: [],
  // GAGS-HEALTH (append-only). Existing state files that predate the health
  // vertical lack these keys; normalizeState spreads emptyState first, so they
  // default to [] and older state stays valid and loadable.
  healthRuns: [],
  healthApprovals: [],
  healthSequence: 0,
};

export function normalizeState(state = {}) {
  return { ...structuredClone(emptyState), ...state };
}
