// GAGS-HEALTH overlay evaluators — grounded controls for the regimes beyond core
// HIPAA/FDA, verified against primary sources (see standard/health-crosswalk.json).
// Governs the decision; stores no live PHI. Not legal advice. Each evaluator carries
// the regime's legal status and effective date so the UI never overstates an obligation.

// ---- ONC HTI-1 predictive DSI transparency (45 CFR 170.315(b)(11)) ----
// IN-FORCE since 2025-01-01. 31 predictive source attributes across 9 categories;
// Intervention Risk Management over 8 characteristics; 4 access/modify capabilities.

export const HTI1_IRM_CHARACTERISTICS = [
  "validity",
  "reliability",
  "robustness",
  "fairness",
  "intelligibility",
  "safety",
  "security",
  "privacy",
];

export const HTI1_SOURCE_ATTRIBUTE_COUNT = 31; // predictive DSI (45 CFR 170.315(b)(11)(iv)(B))
export const HTI1_ACCESS_CAPABILITIES = ["access", "record", "change", "add-additional"];

// dsi: { isPredictive, sourceAttributesProvided (number), irmCharacteristicsCovered ([]),
//        accessCapabilities ([]), publiclyDisclosed (bool) }
export function evaluatePredictiveDsiTransparency(dsi = {}) {
  if (dsi.isPredictive !== true) {
    return { applicable: false, note: "Evidence-based DSIs require 13 source attributes and no IRM; predictive transparency not triggered." };
  }
  const attrs = Number(dsi.sourceAttributesProvided || 0);
  const irmMissing = HTI1_IRM_CHARACTERISTICS.filter((c) => !(dsi.irmCharacteristicsCovered || []).includes(c));
  const accessMissing = HTI1_ACCESS_CAPABILITIES.filter((c) => !(dsi.accessCapabilities || []).includes(c));
  const passed =
    attrs >= HTI1_SOURCE_ATTRIBUTE_COUNT &&
    irmMissing.length === 0 &&
    accessMissing.length === 0 &&
    Boolean(dsi.publiclyDisclosed);
  return {
    applicable: true,
    status: "in-force",
    effective: "2025-01-01",
    basis: "45 CFR 170.315(b)(11)(iv)(B),(v),(vi)",
    passed,
    sourceAttributes: { required: HTI1_SOURCE_ATTRIBUTE_COUNT, provided: attrs, complete: attrs >= HTI1_SOURCE_ATTRIBUTE_COUNT },
    irmMissingCharacteristics: irmMissing,
    accessMissingCapabilities: accessMissing,
    publiclyDisclosed: Boolean(dsi.publiclyDisclosed),
    evidence: "Predictive DSI source-attribute completeness + IRM coverage + access capabilities + public disclosure.",
  };
}

// ---- 42 CFR Part 2 (SUD records) — 2024 final rule, compliance 2026-02-16 ----
// disclosure: { isPart2Record, tpoConsentValid, consentRevoked, accompanyingNoticeAttached,
//               purpose ("treatment"|"payment"|"operations"|"proceeding"|...),
//               separateProceedingConsentOrCourtOrder, part2ProvenanceTagged }
export function evaluatePart2Disclosure(disclosure = {}) {
  if (disclosure.isPart2Record !== true) {
    return { applicable: false, note: "Not a Part 2 (SUD) record; heightened controls not triggered." };
  }
  const reasons = [];
  const consentOk = disclosure.tpoConsentValid === true && disclosure.consentRevoked !== true;
  if (!consentOk) reasons.push("valid non-revoked TPO consent required (§2.31/§2.33)");
  if (disclosure.accompanyingNoticeAttached !== true) reasons.push("Notice to Accompany Disclosure + consent copy/scope required (§2.32)");
  if (disclosure.purpose === "proceeding" && disclosure.separateProceedingConsentOrCourtOrder !== true) {
    reasons.push("use in civil/criminal/administrative/legislative proceeding requires separate consent or court order (§§2.63-2.64)");
  }
  if (disclosure.part2ProvenanceTagged !== true) reasons.push("record must carry Part 2 provenance tag so the proceedings bar travels with it (§2.12(d))");
  return {
    applicable: true,
    status: "in-force",
    effective: "2026-02-16",
    basis: "42 CFR Part 2 (2024 final rule, FR Doc 2024-02544)",
    passed: reasons.length === 0,
    blockingReasons: reasons,
    note: "§2.25 (accounting of disclosures) compliance is tolled pending revision of 45 CFR 164.528.",
    evidence: "Part 2 consent + accompanying-notice + proceedings-block + provenance-tag check.",
  };
}

// ---- CMS utilization review / prior authorization (CMS-0057-F + MA FAQ) ----
// decision: { type ("denial"|"approval"|"termination"|"admission-downgrade"),
//             specificReasonProvided, individualizedAssessment, algorithmSoleBasis,
//             humanDecisionMaker, decisionWithinTimeframe, isDrugPA, isQhpFfe }
export function evaluateUtilizationReview(decision = {}) {
  const reasons = [];
  const isAdverse = ["denial", "termination", "admission-downgrade"].includes(decision.type);
  // CMS-0057-F: specific denial reason (in force 2026-01-01; excludes drug PAs).
  if (decision.type === "denial" && decision.isDrugPA !== true && decision.specificReasonProvided !== true) {
    reasons.push("specific denial reason required (CMS-0057-F, in force 2026-01-01)");
  }
  // MA FAQ (in force): algorithm cannot be sole basis; must use individual circumstances; human decision.
  if (isAdverse) {
    if (decision.algorithmSoleBasis === true) reasons.push("an algorithm/AI alone cannot be the basis for an adverse determination (CMS-4201-F FAQ, 42 CFR 422.101(c))");
    if (decision.individualizedAssessment !== true) reasons.push("decision must be based on the individual patient's circumstances, not solely a group dataset (42 CFR 422.101(c))");
    if (decision.humanDecisionMaker !== true) reasons.push("medical-necessity determination reserved to a qualified licensed professional (CA SB 1120; MA medical-director involvement)");
  }
  // Timeframe SLA (in force 2026-01-01; excludes QHP-FFE and drug PAs).
  if (decision.isQhpFfe !== true && decision.isDrugPA !== true && decision.decisionWithinTimeframe === false) {
    reasons.push("prior-auth decision timeframe exceeded (72h expedited / 7 calendar days standard, CMS-0057-F)");
  }
  return {
    applicable: true,
    status: "in-force",
    basis: "CMS-0057-F (89 FR 8758); CMS-4201-F FAQ (2024-02-06); CA SB 1120",
    passed: reasons.length === 0,
    blockingReasons: reasons,
    evidence: "Specific denial reason + individualized-assessment + human-decision + timeframe checks.",
  };
}

// ---- Patient-facing AI disclosure (CA AB 3030; Utah UAIPA/HB452; TX TRAIGA) ----
// comm: { usesGenerativeAi, patientFacing, clinicalContent, disclosurePresent,
//         humanProviderReviewed, channel }
export function evaluatePatientAiDisclosure(comm = {}) {
  if (comm.usesGenerativeAi !== true || comm.patientFacing !== true) {
    return { applicable: false, note: "No generative-AI patient-facing communication; disclosure not triggered." };
  }
  // AB 3030 exemption: disclosure not required if a licensed provider read and reviewed it.
  const exempt = comm.humanProviderReviewed === true;
  const passed = exempt || comm.disclosurePresent === true;
  return {
    applicable: true,
    status: "in-force",
    effective: "2025-01-01",
    basis: "CA AB 3030 (Health & Safety Code 1339.75-78); Utah UAIPA/HB 452; TX TRAIGA HB 149 (eff. 2026-01-01)",
    passed,
    exemptByHumanReview: exempt,
    note: "AB 3030 requires an AI-generated disclaimer + human-contact instructions unless a licensed provider reviewed the message.",
    evidence: "GenAI patient-communication disclosure presence or human-review exemption.",
  };
}

// ---- Aggregated overlay readiness by segment, with honest legal status/dates ----
export const overlayRegimes = [
  { id: "HX-12", name: "ONC HTI-1 predictive DSI transparency", status: "in-force", effective: "2025-01-01", segments: ["provider", "samd-vendor", "government-health"] },
  { id: "HX-13", name: "CMS prior-auth + MA AI (no algorithm-only denials)", status: "in-force", effective: "2026-01-01", segments: ["payer-administrative", "government-health"], note: "Prior Authorization API requirement effective 2027-01-01 (future)." },
  { id: "HX-14", name: "42 CFR Part 2 SUD consent/segmentation", status: "in-force", effective: "2026-02-16", segments: ["provider", "government-health", "payer-administrative"], note: "§2.25 accounting tolled." },
  { id: "HX-17a", name: "CA AB 3030 / SB 1120 (disclosure + UR human decision)", status: "in-force", effective: "2025-01-01", segments: ["provider", "payer-administrative"] },
  { id: "HX-17b", name: "Colorado AI Act (SB24-205) high-risk duties", status: "future", effective: "2026-06-30", segments: ["provider", "payer-administrative", "samd-vendor"], note: "Delayed from 2026-02-01 by SB25B-004; repeal-and-replace effort reported — re-verify before effective date." },
  { id: "HX-18", name: "EU AI Act high-risk medical AI", status: "future", effective: "2027-08-02", segments: ["samd-vendor"], note: "Annex III standalone 2026-08-02; Annex I/MDR-IVDR embedded 2027-08-02. Digital Omnibus may delay; not yet in Official Journal." },
  { id: "HX-15", name: "NIST SP 800-66r2 / AI RMF / AI 600-1 mapping", status: "source-identified", segments: ["government-health"], note: "Detail pending verification." },
  { id: "HX-16", name: "CHAI assurance / model-card transparency", status: "source-identified", segments: ["provider", "samd-vendor"], note: "Aligns with HTI-1 source attributes; detail pending verification." },
];

export function buildHealthOverlayReadiness(segment = "administrative") {
  const applicable = overlayRegimes.filter((r) => r.segments.includes(segment));
  return {
    segment,
    truthfulBoundary: "Overlay applicability is informational, not legal advice. 'future' regimes are not yet in force; 'source-identified' detail is pending verification.",
    inForce: applicable.filter((r) => r.status === "in-force"),
    future: applicable.filter((r) => r.status === "future"),
    sourceIdentified: applicable.filter((r) => r.status === "source-identified"),
  };
}
