# Health Forward-Looking Regimes Standard (HX-9-11, HX-17b, HX-18)

**Status: forward-looking. Nothing in this document is a current binding obligation.**
Not legal advice. No live PHI. Re-verify each regime's status before its effective date.

GovernPilot implements these regimes as **configurable, anticipatory controls** so an
operator is ready before an obligation (if any) becomes operative — without ever
representing a proposed or not-yet-effective rule as current law. Each evaluator carries an
explicit legal-status label and effective date (`server/health-forward-controls.mjs`,
verified by `npm run health:forward-check`).

## HX-9-11 — HIPAA Security Rule NPRM (Jan 6, 2025) [NPRM-2025, PROPOSED — not final]

The HHS OCR Notice of Proposed Rulemaking (90 FR 898, Jan 6 2025) would, among other
changes, make several "addressable" specifications "required" and add explicit mandates.
GovernPilot tracks the headline forward controls:

- **Encryption of ePHI at rest** — proposed 45 CFR 164.312(a)(2)(vi)
- **Encryption of ePHI in transit** — proposed 45 CFR 164.312(e)(2)(ii)
- **Multi-factor authentication** — proposed 45 CFR 164.312(g)
- **Technology asset inventory + network map** — proposed 45 CFR 164.308
- **Vulnerability scanning + penetration testing** — proposed 45 CFR 164.308

These are offered as configurable readiness only. They are **not** asserted as current HIPAA
requirements; the comment period has closed and no final rule exists as of this build.

## HX-17b — Colorado AI Act (SB 24-205, as amended by SB 25B-004) [FUTURE — operative 2026-06-30]

SB 25B-004 (signed Aug 28, 2025) postponed the principal operative date from 2026-02-01 to
**2026-06-30** without altering the law's substance; further substantive amendments were
anticipated in the 2026 regular session. High-risk-AI deployer/developer duties (C.R.S.
6-1-1701 et seq.) implemented as forward controls:

- Risk-management policy & program for high-risk AI (deployer)
- Impact assessments for high-risk AI systems (deployer)
- Consumer notice when a high-risk system makes/contributes to a consequential decision
- Right to correct data and to appeal via human review
- Developer documentation/disclosures enabling deployer duties
- Reasonable care to avoid algorithmic discrimination + Attorney-General notification

Healthcare is a covered "consequential decision." Not yet operative — re-verify before relying.

## HX-18 — EU AI Act high-risk medical AI (Reg. (EU) 2024/1689) [FUTURE]

Active application dates: **Annex III** standalone high-risk **2026-08-02**; **Annex I**
(AI embedded in MDR/IVDR-regulated medical devices) **2027-08-02**. The "Digital Omnibus on
AI" (provisional agreement Nov 2025) would defer these to 2027-12-02 / 2028-08-02, but is
**not yet published in the Official Journal**, so the active dates still stand. High-risk
provider obligations implemented as forward controls (Arts. 9-15):

- Risk management system (Art. 9)
- Data and data governance (Art. 10)
- Technical documentation (Art. 11 / Annex IV)
- Automatic record-keeping / logging (Art. 12)
- Transparency & instructions for use (Art. 13)
- Human oversight (Art. 14)
- Accuracy, robustness, and cybersecurity (Art. 15)

Not yet applicable — re-verify; the deferral instrument is not yet in force.
