// GAGS-HEALTH forward-looking regime evaluators (HX-9-11, HX-17b, HX-18).
//
// CRITICAL TRUTHFULNESS RULE: nothing in this module asserts a current binding
// obligation. Each evaluator carries an explicit legal status and effective date
// and is implemented as a FORWARD-LOOKING / CONFIGURABLE control posture so the
// platform is ready before the obligation (if any) becomes operative — without
// ever telling a buyer that a not-yet-effective or proposed rule is current law.
// Not legal advice. No live PHI. Re-verify status before each effective date.
//
//   HX-9-11  HIPAA Security Rule NPRM (Jan 6 2025)         -> status: nprm-proposed (NOT final)
//   HX-17b   Colorado AI Act (SB24-205 as amended)         -> status: future (operative 2026-06-30)
//   HX-18    EU AI Act high-risk medical AI                -> status: future (active 2026-08-02 / 2027-08-02)

export const forwardControlsVersion = "governpilot-health-forward-controls/v1";

// ---------------------------------------------------------------------------
// HX-9-11 — HIPAA Security Rule NPRM (Jan 6 2025) forward controls.
// PROPOSED, NOT FINAL. The 2025 NPRM would, among other things, make several
// "addressable" specifications "required" and add explicit encryption, MFA, and
// asset-inventory mandates. Implemented as anticipatory/configurable controls.
// ---------------------------------------------------------------------------
export const NPRM_FORWARD_CONTROLS = [
  { id: "encryption-at-rest", label: "Encryption of ePHI at rest", basis: "Proposed 45 CFR 164.312(a)(2)(vi) (NPRM 2025)" },
  { id: "encryption-in-transit", label: "Encryption of ePHI in transit", basis: "Proposed 45 CFR 164.312(e)(2)(ii) (NPRM 2025)" },
  { id: "multi-factor-authentication", label: "Multi-factor authentication", basis: "Proposed 45 CFR 164.312(g) (NPRM 2025)" },
  { id: "asset-inventory", label: "Technology asset inventory + network map", basis: "Proposed 45 CFR 164.308 asset-inventory/network-map (NPRM 2025)" },
  { id: "vulnerability-management", label: "Vulnerability scanning + penetration testing", basis: "Proposed 45 CFR 164.308 (NPRM 2025)" },
];

// posture: { [controlId]: boolean } — which forward controls are CONFIGURED.
export function evaluateHipaaNprmForwardControls(posture = {}) {
  const controls = NPRM_FORWARD_CONTROLS.map((c) => ({ ...c, configured: posture[c.id] === true }));
  const configuredCount = controls.filter((c) => c.configured).length;
  return {
    id: "HX-9-11",
    regime: "HIPAA Security Rule NPRM (Jan 6, 2025)",
    status: "nprm-proposed",
    legalStatusLabel: "[NPRM-2025] PROPOSED — not final; not a current obligation",
    basis: "90 FR 898 (proposed rule, Jan 6 2025); comment period closed; no final rule as of this build",
    controls,
    readinessPct: Math.round((configuredCount / NPRM_FORWARD_CONTROLS.length) * 100),
    allConfigured: configuredCount === NPRM_FORWARD_CONTROLS.length,
    truthfulNote:
      "These controls anticipate a PROPOSED rule. They are offered as configurable readiness, never asserted as a current HIPAA requirement. Re-verify if/when a final rule publishes.",
  };
}

// ---------------------------------------------------------------------------
// HX-17b — Colorado AI Act (SB 24-205), as amended by SB 25B-004.
// FUTURE: operative 2026-06-30 (postponed from 2026-02-01 by SB 25B-004, signed
// Aug 28 2025; substance unchanged by the delay). Further substantive amendments
// were anticipated in the 2026 regular session — re-verify before relying.
// High-risk duties implemented as forward-looking controls.
// ---------------------------------------------------------------------------
export const COLORADO_HIGH_RISK_DUTIES = [
  { id: "risk-management-program", label: "Maintain a risk-management policy & program for high-risk AI", actor: "deployer", basis: "C.R.S. 6-1-1703 (SB24-205)" },
  { id: "impact-assessment", label: "Complete impact assessments for high-risk AI systems", actor: "deployer", basis: "C.R.S. 6-1-1703" },
  { id: "consumer-notice", label: "Notify consumers when a high-risk system makes/contributes to a consequential decision", actor: "deployer", basis: "C.R.S. 6-1-1703" },
  { id: "right-to-appeal-correct", label: "Provide opportunity to correct data and to appeal via human review", actor: "deployer", basis: "C.R.S. 6-1-1703" },
  { id: "developer-disclosure", label: "Developer documentation/disclosures enabling deployer duties", actor: "developer", basis: "C.R.S. 6-1-1702" },
  { id: "algorithmic-discrimination-duty", label: "Reasonable care to avoid algorithmic discrimination + AG notification", actor: "both", basis: "C.R.S. 6-1-1702/1703" },
];

// record: { isHighRisk: bool, duties: { [dutyId]: boolean } }
export function evaluateColoradoHighRiskDuties(record = {}) {
  if (record.isHighRisk !== true) {
    return {
      id: "HX-17b",
      regime: "Colorado AI Act (SB24-205, amended SB25B-004)",
      status: "future",
      applicable: false,
      note: "Duties attach only to a high-risk AI system that makes/contributes to a consequential decision.",
    };
  }
  const duties = COLORADO_HIGH_RISK_DUTIES.map((d) => ({ ...d, configured: (record.duties || {})[d.id] === true }));
  const configured = duties.filter((d) => d.configured).length;
  return {
    id: "HX-17b",
    regime: "Colorado AI Act (SB24-205, as amended by SB25B-004)",
    status: "future",
    applicable: true,
    legalStatusLabel: "[FUTURE] not yet operative — operative date 2026-06-30",
    effective: "2026-06-30",
    basis: "C.R.S. 6-1-1701 et seq. (SB24-205); operative date set by SB25B-004 (signed 2025-08-28)",
    duties,
    readinessPct: Math.round((configured / COLORADO_HIGH_RISK_DUTIES.length) * 100),
    allConfigured: configured === COLORADO_HIGH_RISK_DUTIES.length,
    truthfulNote:
      "Not yet operative as of this build. Substance was unchanged by the SB25B-004 delay, but further amendments were anticipated in the 2026 session — re-verify before the effective date. Not legal advice.",
  };
}

// ---------------------------------------------------------------------------
// HX-18 — EU AI Act high-risk medical AI.
// FUTURE: active application dates are Annex III standalone high-risk 2026-08-02
// and Annex I (AI embedded in regulated medical devices, MDR/IVDR) 2027-08-02.
// The "Digital Omnibus on AI" (provisional agreement Nov 2025) would defer these
// to 2027-12-02 / 2028-08-02 respectively, but is NOT YET published in the
// Official Journal — so the 2026-08-02 / 2027-08-02 dates remain active.
// High-risk provider obligations (Arts. 9-15) implemented as forward controls.
// ---------------------------------------------------------------------------
export const EU_AI_ACT_HIGH_RISK_OBLIGATIONS = [
  { id: "risk-management-system", label: "Risk management system", basis: "EU AI Act Art. 9" },
  { id: "data-governance", label: "Data and data governance (training/validation/test quality)", basis: "Art. 10" },
  { id: "technical-documentation", label: "Technical documentation", basis: "Art. 11 / Annex IV" },
  { id: "record-keeping-logging", label: "Automatic record-keeping (logging)", basis: "Art. 12" },
  { id: "transparency-instructions", label: "Transparency & instructions for use", basis: "Art. 13" },
  { id: "human-oversight", label: "Human oversight", basis: "Art. 14" },
  { id: "accuracy-robustness-cybersecurity", label: "Accuracy, robustness, and cybersecurity", basis: "Art. 15" },
];

// record: { isHighRiskMedicalAi: bool, classification: "annex-iii"|"annex-i"|null,
//           obligations: { [obligationId]: boolean } }
export function evaluateEuAiActHighRisk(record = {}) {
  if (record.isHighRiskMedicalAi !== true) {
    return {
      id: "HX-18",
      regime: "EU AI Act high-risk medical AI",
      status: "future",
      applicable: false,
      note: "Obligations attach only to AI classified high-risk under Annex III or Annex I (MDR/IVDR-embedded).",
    };
  }
  const activeDate = record.classification === "annex-i" ? "2027-08-02" : "2026-08-02";
  const obligations = EU_AI_ACT_HIGH_RISK_OBLIGATIONS.map((o) => ({
    ...o,
    configured: (record.obligations || {})[o.id] === true,
  }));
  const configured = obligations.filter((o) => o.configured).length;
  return {
    id: "HX-18",
    regime: "EU AI Act high-risk medical AI",
    status: "future",
    applicable: true,
    classification: record.classification || "annex-iii",
    legalStatusLabel: `[FUTURE] not yet applicable — active application date ${activeDate}`,
    activeApplicationDate: activeDate,
    proposedDeferral: {
      instrument: "Digital Omnibus on AI (provisional agreement Nov 2025)",
      annexIii: "2027-12-02",
      annexI: "2028-08-02",
      inForce: false,
      note: "Not yet published in the EU Official Journal; does not change the active dates until adopted.",
    },
    basis: "Regulation (EU) 2024/1689, Arts. 9-15; Art. 6/Annex III; Art. 6(1)/Annex I (MDR 2017/745, IVDR 2017/746)",
    obligations,
    readinessPct: Math.round((configured / EU_AI_ACT_HIGH_RISK_OBLIGATIONS.length) * 100),
    allConfigured: configured === EU_AI_ACT_HIGH_RISK_OBLIGATIONS.length,
    truthfulNote:
      "Not yet applicable as of this build. The Digital Omnibus may defer the dates but is not yet in the Official Journal — the active dates above still stand. Re-verify. Not legal advice.",
  };
}

export function buildHealthForwardReadiness({ nprmPosture = {}, coloradoRecord = {}, euRecord = {} } = {}) {
  return {
    forwardControlsVersion,
    truthfulBoundary:
      "Forward-looking readiness only. HX-9-11 is a PROPOSED rule (not final); HX-17b and HX-18 are FUTURE regimes not yet operative. Nothing here is asserted as a current obligation. Not legal advice. No live PHI.",
    hipaaNprm: evaluateHipaaNprmForwardControls(nprmPosture),
    coloradoAiAct: evaluateColoradoHighRiskDuties(coloradoRecord),
    euAiAct: evaluateEuAiActHighRisk(euRecord),
  };
}
