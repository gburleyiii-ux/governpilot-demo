// GAGS-HEALTH voluntary-framework evaluators (HX-15 NIST, HX-16 CHAI).
//
// IMPORTANT STATUS: every artifact evaluated here is VOLUNTARY / consensus
// framework guidance, NOT in-force law. NIST SP 800-66 Rev.2, the NIST AI RMF
// (AI 100-1), the GenAI Profile (AI 600-1), and the CHAI Applied Model Card
// (Draft V0.1) each state they are voluntary and do not guarantee compliance.
// The binding instruments they help implement are separate (HIPAA Security Rule
// 45 CFR Part 164; ONC HTI-1 45 CFR 170.315(b)(11)). Grounded in verified research.
// Not legal advice. No live PHI.

export const frameworkVersion = "governpilot-health-frameworks/v1";
export const FRAMEWORK_STATUS = "framework-voluntary";

// ---- NIST AI RMF 1.0 (AI 100-1, Jan 2023) — 4 Core functions ----
export const aiRmfFunctions = ["GOVERN", "MAP", "MEASURE", "MANAGE"];
// MEASURE 2 subcategories most relevant to health AI (privacy + fairness).
export const healthCriticalMeasure = ["MEASURE-2.10 Privacy", "MEASURE-2.11 Fairness and bias"];

// ---- NIST AI 600-1 GenAI Profile (Jul 2024) — exactly 12 GAI risk categories ----
export const gaiRiskCategories = [
  "CBRN Information or Capabilities",
  "Confabulation",
  "Dangerous, Violent, or Hateful Content",
  "Data Privacy",
  "Environmental Impacts",
  "Harmful Bias and Homogenization",
  "Human-AI Configuration",
  "Information Integrity",
  "Information Security",
  "Intellectual Property",
  "Obscene, Degrading, and/or Abusive Content",
  "Value Chain and Component Integration",
];
// For a HEALTH GAI deployment these three are the minimum coverage set.
export const healthRequiredGaiRisks = ["Data Privacy", "Confabulation", "Harmful Bias and Homogenization"];

// ---- CHAI Applied Model Card (Draft V0.1, Nov 2024) — schema.xsd sections ----
export const chaiCardSections = [
  "BasicInfo",
  "ReleaseInfo",
  "ModelSummary",
  "UsesAndDirections",
  "Warnings",
  "TrustIngredients",
  "KeyMetrics",
  "Resources",
  "Bibliography",
];
export const chaiUsesAndDirectionsFields = [
  "IntendedUseAndWorkflow",
  "PrimaryIntendedUsers",
  "HowToUse",
  "TargetedPatientPopulation",
  "CautionedOutOfScopeSettings",
];
export const chaiTrustIngredientFields = [
  "OutcomesAndOutputs",
  "ModelType",
  "InputDataSource",
  "OutputAndInputDataTypes",
  "DevelopmentDataCharacterization",
  "BiasMitigationApproaches",
  "OngoingMaintenance",
  "Security",
  "Transparency",
];
export const chaiKeyMetricPillars = ["UsefulnessUsabilityEfficacy", "FairnessEquity", "SafetyReliability"];
export const chaiKeyMetricFields = ["MetricGoal", "Result", "Interpretation", "TestType", "TestingDataDescription", "ValidationProcessAndJustification"];
export const chaiTestTypes = ["Internal", "External", "Local", "Prospective"];

function present(obj, key) {
  if (!obj || typeof obj !== "object") return false;
  const v = obj[key];
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

// CHAI model-card COMPLETENESS evaluator. card = nested object keyed by the
// schema section/field names above. Returns which sections/fields are present
// vs missing and a completeness score. Voluntary instrument — never "satisfies" HTI-1.
export function evaluateChaiModelCard(card = {}) {
  const missingSections = chaiCardSections.filter((s) => !present(card, s));
  const uses = card.UsesAndDirections || {};
  const trust = (card.TrustIngredients && card.TrustIngredients.AISystemFacts) || card.TrustIngredients || {};
  const km = card.KeyMetrics || {};

  const missingUsesFields = chaiUsesAndDirectionsFields.filter((f) => !present(uses, f));
  const missingTrustFields = chaiTrustIngredientFields.filter((f) => !present(trust, f));
  const pillarResults = chaiKeyMetricPillars.map((p) => {
    const pillar = km[p] || {};
    const missingFields = chaiKeyMetricFields.filter((f) => !present(pillar, f));
    const validTestType = chaiTestTypes.includes(pillar.TestType);
    return { pillar, name: p, missingFields, validTestType, complete: missingFields.length === 0 && validTestType };
  });

  const totalChecks = chaiCardSections.length + chaiUsesAndDirectionsFields.length + chaiTrustIngredientFields.length + chaiKeyMetricPillars.length;
  const passed = (chaiCardSections.length - missingSections.length)
    + (chaiUsesAndDirectionsFields.length - missingUsesFields.length)
    + (chaiTrustIngredientFields.length - missingTrustFields.length)
    + pillarResults.filter((p) => p.complete).length;

  const complete = missingSections.length === 0 && missingUsesFields.length === 0 && missingTrustFields.length === 0 && pillarResults.every((p) => p.complete);

  return {
    framework: "CHAI Applied Model Card",
    version: "Draft V0.1 (Nov 2024)",
    status: FRAMEWORK_STATUS,
    legalNote: "Voluntary transparency instrument; supports — does not by itself legally satisfy — ONC HTI-1 45 CFR 170.315(b)(11). Not legal advice.",
    complete,
    completenessPct: Math.round((passed / totalChecks) * 100),
    missingSections,
    missingUsesFields,
    missingTrustFields,
    keyMetrics: pillarResults.map(({ name, missingFields, validTestType, complete }) => ({ pillar: name, missingFields, validTestType, complete })),
  };
}

// NIST AI RMF function-coverage + GenAI risk-coverage check over a governance record.
// record: { rmfArtifacts: {GOVERN, MAP, MEASURE, MANAGE: bool}, measureSubcategories: [..],
//           gaiRisksCovered: [..] }. Voluntary framework.
export function evaluateNistCoverage(record = {}) {
  const rmf = record.rmfArtifacts || {};
  const functionsCovered = aiRmfFunctions.filter((f) => rmf[f] === true);
  const measureCovered = (record.measureSubcategories || []);
  const healthMeasureCovered = healthCriticalMeasure.filter((m) => measureCovered.includes(m));
  const gaiCovered = (record.gaiRisksCovered || []).filter((r) => gaiRiskCategories.includes(r));
  const healthGaiCovered = healthRequiredGaiRisks.filter((r) => gaiCovered.includes(r));

  return {
    framework: "NIST AI RMF 1.0 + GenAI Profile (AI 600-1)",
    status: FRAMEWORK_STATUS,
    legalNote: "Voluntary, non-sector-specific guidance; does not guarantee HIPAA or any compliance. Not legal advice.",
    rmf: { required: aiRmfFunctions, covered: functionsCovered, complete: functionsCovered.length === aiRmfFunctions.length },
    healthCriticalMeasure: { required: healthCriticalMeasure, covered: healthMeasureCovered, complete: healthMeasureCovered.length === healthCriticalMeasure.length },
    gaiRiskCoverage: { totalCategories: gaiRiskCategories.length, healthRequired: healthRequiredGaiRisks, healthCovered: healthGaiCovered, complete: healthGaiCovered.length === healthRequiredGaiRisks.length },
  };
}

// HIPAA -> NIST CSF / 800-53 evidence structure (SP 800-66 Rev.2). The authoritative
// row-by-row crosswalk lives in NIST's CPRT (machine-readable), not hardcoded here —
// we present the safeguard structure + point to CPRT, and never assert specific control
// numbers we have not verified. Voluntary resource guide.
export function buildHipaaNistEvidenceStructure() {
  return {
    framework: "NIST SP 800-66 Rev.2 (Feb 2024)",
    status: FRAMEWORK_STATUS,
    legalNote: "Voluntary resource guide; does not ensure or guarantee HIPAA Security Rule compliance. Binding instrument is 45 CFR Part 164.",
    safeguardGroups: [
      { group: "Administrative", citation: "45 CFR 164.308" },
      { group: "Physical", citation: "45 CFR 164.310" },
      { group: "Technical", citation: "45 CFR 164.312" },
    ],
    mapsTo: ["NIST CSF v1.1 Subcategories", "NIST SP 800-53 Rev.5 controls"],
    authoritativeMappingSource: "NIST Cybersecurity and Privacy Reference Tool (CPRT) — consume live, machine-readable; do not hardcode.",
    sources: [
      "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-66r2.pdf",
      "https://csrc.nist.gov/pubs/sp/800/66/r2/final",
    ],
  };
}

export function buildHealthFrameworkReadiness({ modelCard = null, nistRecord = null } = {}) {
  return {
    frameworkVersion,
    status: FRAMEWORK_STATUS,
    truthfulBoundary:
      "These are voluntary consensus frameworks, not in-force law. They help evidence the binding HIPAA Security Rule (45 CFR 164) and ONC HTI-1 (45 CFR 170.315(b)(11)). Not legal advice. No live PHI.",
    nist: {
      hipaaEvidence: buildHipaaNistEvidenceStructure(),
      coverage: nistRecord ? evaluateNistCoverage(nistRecord) : null,
    },
    chai: modelCard ? evaluateChaiModelCard(modelCard) : { framework: "CHAI Applied Model Card", version: "Draft V0.1 (Nov 2024)", status: FRAMEWORK_STATUS, note: "Provide a model card to evaluate completeness." },
  };
}
