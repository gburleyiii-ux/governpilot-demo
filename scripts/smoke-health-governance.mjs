// GAGS-HEALTH verification: de-identification evaluator, FDA device router, and
// readiness posture behave correctly and never return live PHI values.
import {
  evaluateSafeHarbor,
  evaluateDeidentification,
  routeFdaDeviceTrack,
  buildHealthGovernanceReadiness,
} from "../server/health-governance.mjs";
import {
  evaluatePredictiveDsiTransparency,
  evaluatePart2Disclosure,
  evaluateUtilizationReview,
  evaluatePatientAiDisclosure,
  buildHealthOverlayReadiness,
} from "../server/health-overlays.mjs";

let failures = 0;
function check(name, cond) {
  if (!cond) failures += 1;
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}`);
}

// Safe Harbor detection: a sample with an SSN + email must flag residual identifiers.
const dirty = evaluateSafeHarbor("Patient John, SSN 123-45-6789, email j@x.com, visit 03/04/2021");
check("Safe Harbor flags residual identifiers in identified text", dirty.machineClean === false && dirty.residualDetectedCategories.includes("social security numbers"));
check("Safe Harbor never echoes the raw identifier values", !JSON.stringify(dirty).includes("123-45-6789"));

// A scrubbed sample is machine-clean (but still flags human-review categories).
const clean = evaluateSafeHarbor("Encounter in year 2021; aggregate cohort summary, no identifiers.");
check("Safe Harbor passes scrubbed text (machine-clean)", clean.machineClean === true);
check("Safe Harbor still requires human review for names/photos/biometrics/catch-all", clean.requiresHumanReviewCategories.length === 4);

// Two-method enforcement: a Limited Data Set / unknown method must fail.
check("unknown de-id method is rejected", evaluateDeidentification({ method: "limited-data-set" }).passed === false);

// Expert Determination requires documented + retained methods/results.
check("Expert Determination fails without documentation", evaluateDeidentification({ method: "expert-determination", expertDetermination: { documented: false } }).passed === false);
check("Expert Determination passes when documented + retained", evaluateDeidentification({ method: "expert-determination", expertDetermination: { documented: true, methodsAndResultsRetained: true } }).passed === true);

// FDA router: all four criteria met -> non-device; any failing -> device track.
const nonDevice = routeFdaDeviceTrack({ notSignalOrImage: true, displaysMedicalInfo: true, recommendationsOnly: true, independentReview: true });
check("all four Non-Device CDS criteria met -> non-device-cds", nonDevice.track === "non-device-cds" && nonDevice.isDevice === false);
const device = routeFdaDeviceTrack({ notSignalOrImage: false, displaysMedicalInfo: true, recommendationsOnly: true, independentReview: true });
check("failing a criterion -> fda-device track", device.track === "fda-device" && device.failedCriteria.includes("notSignalOrImage"));
check("device track surfaces GMLP/PCCP/postmarket controls", device.deviceTrackControls.length === 3);

// Readiness posture: in-force HIPAA controls present; NPRM controls labelled forward-looking; no PHI leak.
const readiness = buildHealthGovernanceReadiness({
  segment: "payer-administrative",
  deidentification: { method: "safe-harbor", sample: "year 2021 aggregate" },
  useCase: { notSignalOrImage: true, displaysMedicalInfo: true, recommendationsOnly: true, independentReview: true },
});
check("readiness reports in-force HIPAA controls", readiness.hipaaControls.some((c) => c.id === "HX-7" && c.status === "in-force"));
check("readiness labels NPRM controls as proposed (not in force)", readiness.forwardLookingControls.every((c) => c.status === "nprm-2025-proposed"));
check("readiness declares truthful boundary (no live PHI)", /no live PHI/i.test(readiness.truthfulBoundary));
check("readiness maps segment to applicable regimes", Array.isArray(readiness.applicableRegimes) && readiness.applicableRegimes.includes("HIPAA"));
check("readiness recommends administrative initial scope", /administrative\/operational PHI AI/.test(readiness.recommendedInitialScope));

// ---- Overlay evaluators (grounded, verified regimes) ----

// ONC HTI-1 predictive DSI: incomplete attrs/IRM/access fails; complete set passes.
check("HTI-1 incomplete predictive DSI fails transparency", evaluatePredictiveDsiTransparency({ isPredictive: true, sourceAttributesProvided: 10, irmCharacteristicsCovered: ["fairness"], accessCapabilities: ["access"], publiclyDisclosed: false }).passed === false);
check("HTI-1 complete predictive DSI passes", evaluatePredictiveDsiTransparency({ isPredictive: true, sourceAttributesProvided: 31, irmCharacteristicsCovered: ["validity", "reliability", "robustness", "fairness", "intelligibility", "safety", "security", "privacy"], accessCapabilities: ["access", "record", "change", "add-additional"], publiclyDisclosed: true }).passed === true);
check("HTI-1 evidence-based DSI not subject to predictive transparency", evaluatePredictiveDsiTransparency({ isPredictive: false }).applicable === false);

// 42 CFR Part 2: missing consent/notice/provenance blocks; complete passes; proceeding needs separate consent.
check("Part 2 disclosure without consent is blocked", evaluatePart2Disclosure({ isPart2Record: true, tpoConsentValid: false, accompanyingNoticeAttached: true, part2ProvenanceTagged: true }).passed === false);
check("Part 2 proceeding use without separate consent is blocked", evaluatePart2Disclosure({ isPart2Record: true, tpoConsentValid: true, accompanyingNoticeAttached: true, part2ProvenanceTagged: true, purpose: "proceeding", separateProceedingConsentOrCourtOrder: false }).passed === false);
check("Part 2 compliant disclosure passes", evaluatePart2Disclosure({ isPart2Record: true, tpoConsentValid: true, consentRevoked: false, accompanyingNoticeAttached: true, part2ProvenanceTagged: true, purpose: "treatment" }).passed === true);

// CMS / MA utilization review: algorithm-sole-basis denial blocked; compliant passes.
check("UR denial with algorithm as sole basis is blocked", evaluateUtilizationReview({ type: "denial", algorithmSoleBasis: true, individualizedAssessment: false, humanDecisionMaker: false, specificReasonProvided: false }).passed === false);
check("UR denial without specific reason is blocked", evaluateUtilizationReview({ type: "denial", specificReasonProvided: false, individualizedAssessment: true, humanDecisionMaker: true, algorithmSoleBasis: false }).passed === false);
check("UR compliant denial passes", evaluateUtilizationReview({ type: "denial", specificReasonProvided: true, individualizedAssessment: true, humanDecisionMaker: true, algorithmSoleBasis: false, decisionWithinTimeframe: true }).passed === true);

// Patient-facing AI disclosure: missing disclosure blocked unless human-reviewed.
check("GenAI patient message without disclosure is blocked", evaluatePatientAiDisclosure({ usesGenerativeAi: true, patientFacing: true, disclosurePresent: false, humanProviderReviewed: false }).passed === false);
check("GenAI patient message human-reviewed is exempt", evaluatePatientAiDisclosure({ usesGenerativeAi: true, patientFacing: true, disclosurePresent: false, humanProviderReviewed: true }).passed === true);

// Overlay readiness: future regimes labeled future, never as in-force.
const overlay = buildHealthOverlayReadiness("samd-vendor");
check("overlay readiness separates in-force from future regimes", Array.isArray(overlay.future) && overlay.future.some((r) => r.id === "HX-18" && r.status === "future"));
check("overlay readiness never marks EU AI Act as in-force", !overlay.inForce.some((r) => r.id === "HX-18"));

if (failures > 0) {
  console.error(`\nhealth-governance: ${failures} case(s) failed`);
  process.exit(1);
}
console.log("\nhealth-governance: all cases passed (GAGS-HEALTH + overlays)");
