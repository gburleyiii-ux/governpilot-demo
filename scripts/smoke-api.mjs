const baseUrl = process.env.SENTINELOPS_API_BASE || "http://127.0.0.1:4175/api";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${await response.text()}`);
  }
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("json") ? response.json() : response.text();
}

const health = await request("/health");
const created = await request("/runs", { method: "POST", body: "{}" });
const approved = await request(`/runs/${created.run.id}/approval`, {
  method: "POST",
  body: JSON.stringify({
    state: "approved",
    reviewer: "Grant Burley III",
    note: "Smoke test approval for controlled pilot.",
  }),
});
const evaled = await request(`/runs/${created.run.id}/evals`, { method: "POST", body: "{}" });
const agentReviewed = await request(`/runs/${created.run.id}/agent-review`, { method: "POST", body: "{}" });
const evidence = await request(`/runs/${created.run.id}/evidence`);
const manifest = await request(`/runs/${created.run.id}/evidence-manifest`);
const bundle = await request(`/runs/${created.run.id}/evidence-bundle`);
const auditIntegrity = await request("/audit/integrity");

console.log(
  JSON.stringify(
    {
      service: health.service,
      agentMode: health.agentMode,
      runId: created.run.id,
      approvalState: approved.run.approvalState,
      approvalRole: approved.latestApproval.reviewerRole,
      policyStatus: approved.latestPolicyCheck.status,
      evalToolScore: evaled.run.evals.find((metric) => metric.id === "eval-tools")?.score,
      agentMode: agentReviewed.latestAgentReview.mode,
      agentRecommendation: agentReviewed.latestAgentReview.recommendation,
      agentCitationCount: agentReviewed.latestAgentReview.citations.length,
      evidenceHasSignature: evidence.includes("Approval Signatures"),
      evidenceHasAgentReview: evidence.includes("Agent Review"),
      evidenceHasCitations: evidence.includes("Retrieved Policy Citations"),
      manifestHasPacketHash: manifest.packet.sha256.length === 64,
      manifestHasManifestHash: manifest.manifestSha256.length === 64,
      bundleHasPacket: bundle.evidencePacket.includes("Approval Signatures"),
      ledgerIntegrityPassed: auditIntegrity.approvalLedger.passed,
    },
    null,
    2,
  ),
);
