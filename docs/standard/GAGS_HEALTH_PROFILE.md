# GAGS Health Profile (GAGS-HEALTH)

**Document ID:** GAGS-HEALTH
**Version:** 0.1.0 (Draft for Review)
**Status:** Draft — not legal advice, not a HIPAA/FDA authorization
**Date:** 2026-06-19
**Extends:** `GOVERNPILOT_AI_GOVERNANCE_STANDARD.md` (GAGS-CORE)

> **Truthful boundary (normative for this document):** This profile maps the GovernPilot
> control plane onto U.S. health-sector AI obligations. It is engineered so that an
> implementation conforming to it produces the evidence those regimes require. It is **not**
> legal advice, **not** a HIPAA Security Rule certification, and **not** an FDA clearance.
> Every requirement is tagged with its legal status:
> **[IN-FORCE]** = current binding law/guidance (cited);
> **[NPRM-2025]** = proposed in the Jan 6 2025 HIPAA Security Rule NPRM, **not final** as of this draft — implemented as forward-looking/configurable, never asserted as a current obligation;
> **[SOURCE-IDENTIFIED]** = an official source is identified but the specific requirement text is not yet verified in this profile; treated as roadmap, not asserted as fact.

## Scope & buyer segments

GAGS-HEALTH governs AI systems that act on Protected Health Information (PHI/ePHI) or
support health decisions, for four segments: **government health** (VA, CMS, MHS, NIH),
**hospitals/health systems**, **health-tech / medical-AI vendors (SaMD)**, and
**payers/administrative**. Per the research recommendation, the **initial scope is
administrative/operational PHI AI** (documentation, scheduling, coding, prior auth); the
profile includes an FDA device-track **router** (HX-8) that escalates clinical/diagnostic
use cases to the device track.

## Recommended initial scope

Govern administrative/operational PHI AI first: the binding obligations are HIPAA controls
GovernPilot already provides, and such tools are usually **Non-Device CDS** (avoiding FDA
premarket burden). Clinical/predictive-diagnostic AI more often fails the four-criterion
Non-Device CDS test and becomes an FDA-regulated device — higher burden, longer timeline.

---

## Normative health requirements (HX)

Format: **ID | Status | Statement | Basis | Verification**

### HIPAA — handling PHI (in-force)

- **HX-1** *[IN-FORCE]* — The platform MUST declare its **Business Associate** posture: when
  it touches ePHI it is a business associate and its PHI handling is governed accordingly.
  *Basis:* HIPAA Security Rule binds covered entities **and** business associates ("regulated
  entities"), 45 CFR 164.306(a). *Verification:* `health:check` (BA posture asserted in the
  health readiness object + data boundary).
- **HX-2** *[IN-FORCE]* — Every AI action affecting ePHI MUST be attributable to a **unique
  user identity**. *Basis:* Access Control, Unique User Identification (**Required**),
  §164.312(a)(2)(i). *Verification:* RBAC/identity (`smoke:rbac`, `auth:check`) + health run actor binding.
- **HX-3** *[IN-FORCE]* — The platform MUST support an **emergency ("break-glass") access
  procedure** that is itself recorded. *Basis:* Emergency Access Procedure (**Required**),
  §164.312(a)(2)(ii). *Verification:* `health:check` (break-glass path is logged to the ledger).
- **HX-4** *[IN-FORCE]* — Session controls (**automatic logoff**) SHOULD be enforced.
  *Basis:* Automatic Logoff (**Addressable**), §164.312(a)(2)(iii).
- **HX-5** *[IN-FORCE]* — The platform MUST **record and be able to examine** AI activity in
  systems containing ePHI. *Basis:* Audit Controls, §164.312(b) (no prescribed fields; risk-driven).
  *Verification:* audit ledger (`audit:check`) over health runs.
- **HX-6** *[IN-FORCE]* — The platform MUST provide **integrity** corroboration that ePHI-affecting
  records have not been improperly altered. *Basis:* Integrity standard + addressable
  authentication mechanism (checksums/digital signatures), §164.312(c)(1)/(c)(2). *Verification:*
  hash-chained ledger tamper-detection (`audit:check`) — the existing GAGS AE-1 mechanism.
- **HX-7** *[IN-FORCE]* — When data is treated as **de-identified**, the platform MUST enforce
  **exactly one of the two lawful methods** and capture its evidence: **Safe Harbor** (removal
  of the 18 identifier categories, §164.514(b)(2), incl. the (R) catch-all and the
  "no actual knowledge" prong) **or Expert Determination** (§164.514(b)(1)) with the expert's
  methods/results documented and retained for OCR on request. A Limited Data Set is **not** a
  third de-identification pathway. *Basis:* §164.514(b). *Verification:* `health:check`
  de-identification evaluator (Safe Harbor scrub + Expert-Determination documentation gate).

### FDA — device-track routing (in-force)

- **HX-8** *[IN-FORCE]* — Each health AI use case MUST be routed through the **four conjunctive
  Non-Device CDS criteria** (FD&C Act §520(o)(1)(E)). If **all four** are met → Non-Device CDS
  (administrative track). If **any one fails** → the use case is an **FDA-regulated device** and
  the device track (HX-D1..D3) applies. *Basis:* FDA CDS Software guidance (fda.gov/media/184830).
  *Verification:* `health:check` device router returns `fda-device` when any criterion is false.

### FDA — device track (applies when HX-8 routes to device)

- **HX-D1** *[IN-FORCE]* — Device-track AI SHOULD align to **GMLP** (10 guiding principles,
  FDA/Health Canada/UK MHRA, Oct 2021).
- **HX-D2** *[IN-FORCE]* — Planned model changes SHOULD be governed by a **PCCP** (3-part:
  modifications, protocol, impact assessment; finalized Dec 4, 2024) — noting some changes still
  require new premarket review.
- **HX-D3** *[SOURCE-IDENTIFIED / DRAFT]* — Device-track AI SHOULD implement **postmarket
  performance monitoring**, transparency disclosures, and **bias/health-equity evals** per FDA's
  **Jan 6 2025 draft TPLC guidance** (draft, non-binding; comments closed Apr 7 2025).

### HIPAA Security Rule NPRM — forward-looking (proposed, not final)

Implemented as **configurable/anticipatory** controls; the product MUST NOT present these as
current legal obligations.

- **HX-9** *[NPRM-2025]* — Configurable enforcement of **encryption of ePHI at rest and in transit**.
- **HX-10** *[NPRM-2025]* — Configurable **multi-factor authentication** requirement.
- **HX-11** *[NPRM-2025]* — A **technology asset inventory + ePHI data-flow/network map**,
  reviewable at least every 12 months and on material change.
*Basis:* HHS HIPAA Security Rule NPRM fact sheet (Jan 6 2025). **Not final as of 2026-06.**
*Verification:* `health:forward-check` (`server/health-forward-controls.mjs`) — forward-control
readiness evaluator that labels the rule PROPOSED and never asserts it as a current obligation.

### Overlay regimes — grounded (verified against primary sources) + roadmap

Now verified and implemented as evaluators (`server/health-overlays.mjs`), each tagged with
its legal status and effective date:

- **HX-12** *[IN-FORCE 2025-01-01]* — ONC/ASTP **HTI-1 predictive DSI** transparency:
  31 source attributes, Intervention Risk Management over 8 characteristics (validity,
  reliability, robustness, fairness, intelligibility, safety, security, privacy), and 4
  access capabilities. *Basis:* 45 CFR 170.315(b)(11)(iv)(B),(v),(vi). *Verification:* `health:check`.
- **HX-13** *[IN-FORCE 2026-01-01]* — **CMS-0057-F** + Medicare Advantage AI FAQ: specific denial
  reason, 72h/7d timeframes, and the rule that an algorithm cannot be the sole basis for an
  adverse determination (individualized assessment required). *Basis:* 89 FR 8758; 42 CFR
  422.101(c); CMS FAQ 2024-02-06. Prior Authorization API requirement is **future (2027-01-01)**.
  *Verification:* `health:check`.
- **HX-14** *[IN-FORCE 2026-02-16]* — **42 CFR Part 2** SUD records: single TPO consent,
  Notice to Accompany Disclosure (§2.32), proceedings-use bar (§§2.63-2.64), and Part 2
  provenance tagging. *Basis:* FR Doc 2024-02544. §2.25 accounting tolled. *Verification:* `health:check`.
- **HX-17a** *[IN-FORCE 2025-01-01]* — **California AB 3030** (GenAI patient-communication
  disclosure unless human-reviewed) + **SB 1120** (medical-necessity only by a licensed
  professional; AI cannot deny/delay/modify on medical necessity). *Verification:* `health:check`.
- **HX-17b** *[FUTURE 2026-06-30]* — **Colorado AI Act (SB24-205, amended SB25B-004)** high-risk
  duties (risk-management program, impact assessments, consumer notice/appeal, AG notification).
  Operative date postponed to 2026-06-30 by SB25B-004 (signed 2025-08-28); substance unchanged;
  further amendments anticipated in the 2026 session. Implemented as **forward-looking controls**
  (`health:forward-check`), labeled FUTURE — **not in force**.
- **HX-18** *[FUTURE: Annex III 2026-08-02 / Annex I medical 2027-08-02]* — **EU AI Act**
  high-risk medical AI (Art. 9-15). Digital Omnibus (provisional, Nov 2025) would defer to
  2027-12-02 / 2028-08-02 but is not yet in the Official Journal. Implemented as **forward-looking
  controls** (`health:forward-check`), labeled FUTURE — **not in force**.
- **HX-15** *[FRAMEWORK — VOLUNTARY]* — **NIST**: SP 800-66r2 HIPAA→CSF/800-53 evidence
  structure (row-by-row crosswalk in NIST CPRT), AI RMF 1.0 function coverage (GOVERN/MAP/
  MEASURE/MANAGE; MEASURE 2.10 Privacy, 2.11 Fairness), and AI 600-1 GAI risk coverage
  (12 categories; health min-set Data Privacy, Confabulation, Harmful Bias). Voluntary, not
  law — helps evidence HIPAA but does not guarantee compliance. *Verification:* `health:frameworks-check`.
- **HX-16** *[FRAMEWORK — VOLUNTARY]* — **CHAI Applied Model Card** (Draft V0.1) completeness
  evaluator over the 9-section schema (incl. Key Metrics: 3 pillars × 6 fields). Voluntary
  transparency instrument; supports but does **not** legally satisfy ONC HTI-1.
  *Verification:* `health:frameworks-check`. Evaluators: `server/health-frameworks.mjs`.

---

## Health-specific evals (safety gating)

- **PHI-leakage red-team** — does the AI emit identifiers that fail the Safe Harbor scrub? (HX-7).
- **Clinical-safety eval** — required on the device track (HX-8 → HX-D*).
- **Health-equity / bias eval** — subgroup performance; aligns with FDA draft TPLC (HX-D3) and HX-17.

## Audit evidence a health buyer needs

- HIPAA: access/audit/integrity logs (HX-2,5,6); de-identification method + Expert-Determination
  documentation retained for OCR (HX-7); break-glass records (HX-3).
- FDA device track: Non-Device CDS routing determination (HX-8); GMLP/PCCP artifacts (HX-D1,D2);
  postmarket monitoring + bias evidence (HX-D3).
- Forward-looking (NPRM): asset inventory / data-flow map (HX-11).

## Conformance

GAGS-HEALTH conformance is reported alongside GAGS-CORE via `npm run conformance`. **Only
[IN-FORCE] HX requirements with executable checks gate**; [NPRM-2025] and [SOURCE-IDENTIFIED]
items are reported as **Roadmap** and never silently pass. Crosswalk: `standard/health-crosswalk.json`.
