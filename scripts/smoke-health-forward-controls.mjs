// GAGS-HEALTH forward-looking regime evaluators (HX-9-11 NPRM, HX-17b Colorado,
// HX-18 EU AI Act). These are PROPOSED / FUTURE regimes — the smoke asserts the
// evaluators provide control scaffolding AND that they never assert a current
// obligation (status labels + truthful notes are correct).

import {
  NPRM_FORWARD_CONTROLS,
  COLORADO_HIGH_RISK_DUTIES,
  EU_AI_ACT_HIGH_RISK_OBLIGATIONS,
  evaluateHipaaNprmForwardControls,
  evaluateColoradoHighRiskDuties,
  evaluateEuAiActHighRisk,
  buildHealthForwardReadiness,
} from "../server/health-forward-controls.mjs";

let failures = 0;
function check(name, cond, detail = "") {
  if (!cond) failures += 1;
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}${detail ? ` :: ${detail}` : ""}`);
}

// ---- HX-9-11 HIPAA Security Rule NPRM (PROPOSED, not final) ----
check("NPRM enumerates encryption + MFA + asset-inventory controls",
  NPRM_FORWARD_CONTROLS.some((c) => c.id === "encryption-at-rest") &&
  NPRM_FORWARD_CONTROLS.some((c) => c.id === "multi-factor-authentication") &&
  NPRM_FORWARD_CONTROLS.some((c) => c.id === "asset-inventory"));
const nprmEmpty = evaluateHipaaNprmForwardControls({});
check("NPRM status is nprm-proposed (NOT in-force)", nprmEmpty.status === "nprm-proposed");
check("NPRM label says PROPOSED / not a current obligation", /PROPOSED/.test(nprmEmpty.legalStatusLabel) && /not final|not a current/i.test(nprmEmpty.legalStatusLabel));
check("NPRM empty posture is 0% ready, not all configured", nprmEmpty.readinessPct === 0 && nprmEmpty.allConfigured === false);
const nprmFull = evaluateHipaaNprmForwardControls(Object.fromEntries(NPRM_FORWARD_CONTROLS.map((c) => [c.id, true])));
check("NPRM full posture is 100% ready", nprmFull.readinessPct === 100 && nprmFull.allConfigured === true);
check("NPRM never claims in-force", !/in-force|in force|current law|required by hipaa today/i.test(JSON.stringify(nprmFull).replace(/not a current/gi, "")));

// ---- HX-17b Colorado AI Act (FUTURE, operative 2026-06-30) ----
const coNa = evaluateColoradoHighRiskDuties({ isHighRisk: false });
check("Colorado duties not applicable for non-high-risk", coNa.applicable === false);
const co = evaluateColoradoHighRiskDuties({ isHighRisk: true, duties: {} });
check("Colorado status is future", co.status === "future");
check("Colorado operative date 2026-06-30", co.effective === "2026-06-30");
check("Colorado label says not yet operative", /not yet operative/i.test(co.legalStatusLabel));
check("Colorado enumerates 6 high-risk duties", COLORADO_HIGH_RISK_DUTIES.length === 6 && co.duties.length === 6);
check("Colorado note flags re-verify / further amendments", /re-verify|amendment/i.test(co.truthfulNote));
const coFull = evaluateColoradoHighRiskDuties({ isHighRisk: true, duties: Object.fromEntries(COLORADO_HIGH_RISK_DUTIES.map((d) => [d.id, true])) });
check("Colorado full duties -> 100% ready", coFull.readinessPct === 100 && coFull.allConfigured === true);

// ---- HX-18 EU AI Act high-risk medical AI (FUTURE) ----
const euNa = evaluateEuAiActHighRisk({ isHighRiskMedicalAi: false });
check("EU obligations not applicable when not high-risk", euNa.applicable === false);
const euIii = evaluateEuAiActHighRisk({ isHighRiskMedicalAi: true, classification: "annex-iii", obligations: {} });
check("EU Annex III active date 2026-08-02", euIii.activeApplicationDate === "2026-08-02");
const euI = evaluateEuAiActHighRisk({ isHighRiskMedicalAi: true, classification: "annex-i", obligations: {} });
check("EU Annex I active date 2027-08-02", euI.activeApplicationDate === "2027-08-02");
check("EU status future; Digital Omnibus deferral NOT in force", euI.status === "future" && euI.proposedDeferral.inForce === false);
check("EU enumerates 7 high-risk obligations (Arts 9-15)", EU_AI_ACT_HIGH_RISK_OBLIGATIONS.length === 7 && euIii.obligations.length === 7);
const euFull = evaluateEuAiActHighRisk({ isHighRiskMedicalAi: true, classification: "annex-iii", obligations: Object.fromEntries(EU_AI_ACT_HIGH_RISK_OBLIGATIONS.map((o) => [o.id, true])) });
check("EU full obligations -> 100% ready", euFull.readinessPct === 100 && euFull.allConfigured === true);

// ---- Readiness wrapper truthful boundary ----
const readiness = buildHealthForwardReadiness({ nprmPosture: {}, coloradoRecord: { isHighRisk: true }, euRecord: { isHighRiskMedicalAi: true } });
check("forward readiness boundary: nothing asserted as a current obligation",
  /not yet operative|proposed/i.test(readiness.truthfulBoundary) && /nothing here is asserted as a current obligation/i.test(readiness.truthfulBoundary));

if (failures > 0) {
  console.error(`\nhealth-forward-controls: ${failures} case(s) failed`);
  process.exit(1);
}
console.log("\nhealth-forward-controls: all cases passed (HX-9-11 NPRM, HX-17b Colorado, HX-18 EU — forward-looking, not asserted as law)");
