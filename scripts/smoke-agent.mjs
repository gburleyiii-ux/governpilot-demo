import { runDeploymentReview } from "../agent/sentinelops-agent.mjs";
import { applyGateDecision, createAssessmentRun, rerunEvalPack } from "../server/assessment-engine.mjs";

let run = createAssessmentRun(999);
run = rerunEvalPack(run);
const decision = await applyGateDecision(run, {
  state: "approved",
  reviewer: "Grant Burley III",
  note: "Smoke test approval for agent review.",
});
const review = await runDeploymentReview(decision.run);

console.log(
  JSON.stringify(
    {
      mode: review.mode,
      recommendation: review.recommendation,
      toolUseDecision: review.toolUseDecision,
      confidence: review.confidence,
      requiredActionCount: review.requiredActions.length,
      citationCount: review.citations.length,
      summary: review.summary,
    },
    null,
    2,
  ),
);
