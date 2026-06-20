// GAGS-HEALTH framework evaluators (HX-15 NIST, HX-16 CHAI). Voluntary frameworks.
import {
  evaluateChaiModelCard,
  evaluateNistCoverage,
  buildHipaaNistEvidenceStructure,
  buildHealthFrameworkReadiness,
  gaiRiskCategories,
  chaiCardSections,
  FRAMEWORK_STATUS,
} from "../server/health-frameworks.mjs";

let failures = 0;
function check(name, cond) {
  if (!cond) failures += 1;
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}`);
}

// Exactly 12 GAI risk categories; 9 CHAI sections (schema.xsd).
check("AI 600-1 enumerates exactly 12 GAI risk categories", gaiRiskCategories.length === 12 && gaiRiskCategories.includes("Confabulation") && gaiRiskCategories.includes("Data Privacy"));
check("CHAI card has 9 schema sections", chaiCardSections.length === 9 && chaiCardSections.includes("KeyMetrics"));

// CHAI completeness: empty card is incomplete with missing sections.
const empty = evaluateChaiModelCard({});
check("empty CHAI card flagged incomplete", empty.complete === false && empty.missingSections.length === 9);
check("CHAI evaluator labels voluntary, never 'satisfies' HTI-1", empty.status === FRAMEWORK_STATUS && /does not by itself legally satisfy/i.test(empty.legalNote));

// CHAI completeness: a fully-populated card passes.
const fullCard = {
  BasicInfo: "x", ReleaseInfo: "x", ModelSummary: "x", Resources: "x", Bibliography: "x", Warnings: "x",
  UsesAndDirections: { IntendedUseAndWorkflow: "x", PrimaryIntendedUsers: "x", HowToUse: "x", TargetedPatientPopulation: "x", CautionedOutOfScopeSettings: "x" },
  TrustIngredients: { AISystemFacts: { OutcomesAndOutputs: "x", ModelType: "x", InputDataSource: "x", OutputAndInputDataTypes: "x", DevelopmentDataCharacterization: "x", BiasMitigationApproaches: "x", OngoingMaintenance: "x", Security: "x", Transparency: "x" } },
  KeyMetrics: {
    UsefulnessUsabilityEfficacy: { MetricGoal: "x", Result: "x", Interpretation: "x", TestType: "External", TestingDataDescription: "x", ValidationProcessAndJustification: "x" },
    FairnessEquity: { MetricGoal: "x", Result: "x", Interpretation: "x", TestType: "Local", TestingDataDescription: "x", ValidationProcessAndJustification: "x" },
    SafetyReliability: { MetricGoal: "x", Result: "x", Interpretation: "x", TestType: "Prospective", TestingDataDescription: "x", ValidationProcessAndJustification: "x" },
  },
};
const full = evaluateChaiModelCard(fullCard);
check("complete CHAI card passes (100%)", full.complete === true && full.completenessPct === 100);

// CHAI invalid TestType fails the pillar.
const badTest = evaluateChaiModelCard({ ...fullCard, KeyMetrics: { ...fullCard.KeyMetrics, FairnessEquity: { ...fullCard.KeyMetrics.FairnessEquity, TestType: "Made-Up" } } });
check("CHAI invalid TestType fails the pillar", badTest.keyMetrics.find((p) => p.pillar === "FairnessEquity").validTestType === false && badTest.complete === false);

// NIST coverage: missing health-critical risks/functions flagged; full coverage passes.
const partial = evaluateNistCoverage({ rmfArtifacts: { GOVERN: true }, measureSubcategories: [], gaiRisksCovered: [] });
check("NIST partial coverage flagged incomplete", partial.rmf.complete === false && partial.gaiRiskCoverage.complete === false);
const fullNist = evaluateNistCoverage({
  rmfArtifacts: { GOVERN: true, MAP: true, MEASURE: true, MANAGE: true },
  measureSubcategories: ["MEASURE-2.10 Privacy", "MEASURE-2.11 Fairness and bias"],
  gaiRisksCovered: ["Data Privacy", "Confabulation", "Harmful Bias and Homogenization"],
});
check("NIST full health coverage passes", fullNist.rmf.complete === true && fullNist.healthCriticalMeasure.complete === true && fullNist.gaiRiskCoverage.complete === true);

// HIPAA->NIST evidence structure points to CPRT and asserts no hardcoded control numbers.
const struct = buildHipaaNistEvidenceStructure();
check("HIPAA->NIST structure groups admin/physical/technical with CFR cites", struct.safeguardGroups.length === 3 && struct.safeguardGroups.some((g) => g.citation === "45 CFR 164.312"));
check("HIPAA->NIST defers row-by-row mapping to NIST CPRT (no hardcoded controls)", /CPRT/.test(struct.authoritativeMappingSource));

// Readiness wrapper labels everything voluntary, never in-force.
const readiness = buildHealthFrameworkReadiness({ modelCard: fullCard, nistRecord: { rmfArtifacts: { GOVERN: true, MAP: true, MEASURE: true, MANAGE: true } } });
check("framework readiness declares voluntary (not law) boundary", /not in-force law/i.test(readiness.truthfulBoundary) && readiness.status === FRAMEWORK_STATUS);

if (failures > 0) {
  console.error(`\nhealth-frameworks: ${failures} case(s) failed`);
  process.exit(1);
}
console.log("\nhealth-frameworks: all cases passed (HX-15 NIST + HX-16 CHAI, voluntary)");
