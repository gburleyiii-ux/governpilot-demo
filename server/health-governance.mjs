// GAGS-HEALTH governance module.
//
// Governs healthcare AI deployment decisions (HIPAA + FDA routing). Like the
// trusted-workforce module, it governs the DECISION and never writes or returns
// live PHI. All regulatory grounding is cited in docs/standard/GAGS_HEALTH_PROFILE.md
// and standard/health-crosswalk.json. Not legal advice.

import { createHash } from "node:crypto";

export const readinessVersion = "governpilot-health-governance-readiness/v1";

// Data boundary: categories of PHI this control plane governs decisions about but
// MUST NOT store or return as live values (the 18 HIPAA Safe Harbor identifier
// categories, 45 CFR 164.514(b)(2)).
export const phiIdentifierCategories = [
  "names",
  "geographic subdivisions smaller than a state",
  "dates (except year) and ages over 89",
  "telephone numbers",
  "fax numbers",
  "email addresses",
  "social security numbers",
  "medical record numbers",
  "health plan beneficiary numbers",
  "account numbers",
  "certificate or license numbers",
  "vehicle identifiers and serial numbers",
  "device identifiers and serial numbers",
  "URLs",
  "IP addresses",
  "biometric identifiers",
  "full-face photographs and comparable images",
  "any other unique identifying number, characteristic, or code",
];

export const deidentificationMethods = ["safe-harbor", "expert-determination"];

// Machine-detectable Safe Harbor identifier patterns. Detection is best-effort for the
// catch-all categories (names, photos, biometrics) which require human/NER review; the
// evaluator reports those as "not machine-verifiable" rather than asserting absence.
const detectors = [
  { category: "social security numbers", re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { category: "email addresses", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { category: "telephone numbers", re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
  { category: "IP addresses", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
  { category: "URLs", re: /\bhttps?:\/\/\S+/i },
  { category: "dates (except year) and ages over 89", re: /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](19|20)\d{2}\b/ },
  { category: "geographic subdivisions smaller than a state", re: /\b\d{5}(?:-\d{4})?\b/ },
];

// Categories that require human / NER review and cannot be confirmed absent by regex.
const nonMachineVerifiable = [
  "names",
  "biometric identifiers",
  "full-face photographs and comparable images",
  "any other unique identifying number, characteristic, or code",
];

// Evaluate a Safe Harbor scrub over a text sample. Returns the detectable residual
// identifier categories and the categories that still require human review. Never
// returns the matched values themselves (no PHI in output).
export function evaluateSafeHarbor(sample = "") {
  const text = String(sample);
  const detected = detectors.filter((d) => d.re.test(text)).map((d) => d.category);
  return {
    method: "safe-harbor",
    residualDetectedCategories: [...new Set(detected)],
    requiresHumanReviewCategories: nonMachineVerifiable,
    machineClean: detected.length === 0,
    note: "Machine detection covers structured identifiers only; names/photos/biometrics and the (R) catch-all require human review, and Safe Harbor also requires no actual knowledge of re-identifiability (45 CFR 164.514(b)(2)).",
  };
}

// Evaluate de-identification under one of the two lawful methods (45 CFR 164.514(b)).
// expertDetermination: { documented: boolean, methodsAndResultsRetained: boolean }.
export function evaluateDeidentification({ method, sample = "", expertDetermination } = {}) {
  if (!deidentificationMethods.includes(method)) {
    return {
      passed: false,
      reason: `de-identification method must be one of ${deidentificationMethods.join(" or ")} (45 CFR 164.514(b)); a Limited Data Set is not a de-identification pathway).`,
    };
  }
  if (method === "safe-harbor") {
    const sh = evaluateSafeHarbor(sample);
    return {
      method,
      passed: sh.machineClean,
      basis: "45 CFR 164.514(b)(2)",
      detail: sh,
      evidence: "Safe Harbor scrub result (no identifier values retained).",
    };
  }
  // expert-determination
  const documented = Boolean(expertDetermination && expertDetermination.documented && expertDetermination.methodsAndResultsRetained);
  return {
    method,
    passed: documented,
    basis: "45 CFR 164.514(b)(1)",
    requiresDocumentationForOcr: true,
    evidence: documented
      ? "Expert Determination methods/results documented and retained for OCR on request."
      : "Expert Determination requires documented methods/results retained for OCR (45 CFR 164.514(b)(1)).",
  };
}

// FDA Non-Device CDS router (FD&C Act 520(o)(1)(E), four conjunctive criteria).
// Each input is the criterion AS MET (true = satisfies that prong of the exclusion):
//   notSignalOrImage      - does NOT acquire/process/analyze a medical image or IVD/signal
//   displaysMedicalInfo   - displays/analyzes medical information about a patient
//   recommendationsOnly   - provides recommendations (not a specific directive/output)
//   independentReview     - HCP can independently review the basis (not primary reliance)
export const nonDeviceCdsCriteria = [
  "notSignalOrImage",
  "displaysMedicalInfo",
  "recommendationsOnly",
  "independentReview",
];

export function routeFdaDeviceTrack(useCase = {}) {
  const failed = nonDeviceCdsCriteria.filter((c) => useCase[c] !== true);
  const isDevice = failed.length > 0;
  return {
    track: isDevice ? "fda-device" : "non-device-cds",
    isDevice,
    failedCriteria: failed,
    basis: "FD&C Act 520(o)(1)(E) — four conjunctive Non-Device CDS criteria",
    deviceTrackControls: isDevice
      ? ["GMLP alignment (HX-D1)", "PCCP for model changes (HX-D2)", "postmarket performance + bias monitoring (HX-D3, FDA Jan 2025 draft)"]
      : [],
    note: isDevice
      ? "One or more Non-Device CDS criteria not met -> treat as an FDA-regulated device."
      : "All four Non-Device CDS criteria met -> administrative (HIPAA) track.",
  };
}

// In-force HIPAA control posture (HX-1..HX-7) for a health run. Reports posture only;
// stores no PHI. encryption/MFA/asset-inventory are NPRM-2025 proposed -> forward-looking.
export function buildHealthGovernanceReadiness(options = {}) {
  const {
    segment = "administrative",
    deidentification = null,
    useCase = null,
    breakGlassLogged = true,
    uniqueUserBound = true,
  } = options;

  const deidResult = deidentification ? evaluateDeidentification(deidentification) : null;
  const routing = useCase ? routeFdaDeviceTrack(useCase) : null;

  const hipaaControls = [
    { id: "HX-1", status: "in-force", control: "Business-associate posture declared", citation: "45 CFR 164.306(a)", met: true },
    { id: "HX-2", status: "in-force", control: "Unique user identification on PHI actions", citation: "45 CFR 164.312(a)(2)(i)", met: Boolean(uniqueUserBound) },
    { id: "HX-3", status: "in-force", control: "Emergency (break-glass) access recorded", citation: "45 CFR 164.312(a)(2)(ii)", met: Boolean(breakGlassLogged) },
    { id: "HX-5", status: "in-force", control: "Audit controls over PHI activity", citation: "45 CFR 164.312(b)", met: true },
    { id: "HX-6", status: "in-force", control: "Integrity via hash-chained ledger", citation: "45 CFR 164.312(c)", met: true },
    { id: "HX-7", status: "in-force", control: "De-identification (one of two lawful methods)", citation: "45 CFR 164.514(b)", met: deidResult ? deidResult.passed : null },
  ];

  const forwardLookingControls = [
    { id: "HX-9", status: "nprm-2025-proposed", control: "Encryption of ePHI at rest and in transit", note: "Proposed (Jan 6 2025 NPRM); not final." },
    { id: "HX-10", status: "nprm-2025-proposed", control: "Multi-factor authentication", note: "Proposed; not final." },
    { id: "HX-11", status: "nprm-2025-proposed", control: "Asset inventory + ePHI data-flow map (>= every 12 months)", note: "Proposed; not final." },
  ];

  const segmentApplicability = {
    "government-health": ["HIPAA", "FedRAMP/OMB (via GAGS-CORE)", "CMS (HX-13, source-identified)"],
    "provider": ["HIPAA", "ONC HTI-1 DSI (HX-12, source-identified)", "Joint Commission (HX-16)"],
    "samd-vendor": ["FDA device track (HX-8 -> HX-D*)", "GMLP/PCCP", "HIPAA (BA)"],
    "payer-administrative": ["HIPAA", "CMS prior-auth (HX-13, source-identified)", "state non-discrimination (HX-17)"],
    "administrative": ["HIPAA"],
  };

  const allInForceMet = hipaaControls.every((c) => c.met !== false);

  return {
    readinessVersion,
    segment,
    truthfulBoundary:
      "Governs the healthcare AI deployment decision; stores and returns no live PHI. Not legal advice, not a HIPAA/FDA authorization. NPRM-2025 controls are proposed, not in force.",
    recommendedInitialScope: "administrative/operational PHI AI (documentation, scheduling, coding, prior-auth)",
    hipaaControls,
    deidentification: deidResult,
    fdaRouting: routing,
    forwardLookingControls,
    applicableRegimes: segmentApplicability[segment] || segmentApplicability.administrative,
    inForceReady: allInForceMet,
    postureHash: createHash("sha256")
      .update(JSON.stringify({ segment, hipaaControls, routing: routing && routing.track }))
      .digest("hex"),
  };
}
