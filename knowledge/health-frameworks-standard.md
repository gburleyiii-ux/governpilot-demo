# Health Voluntary Frameworks Standard (NIST + CHAI)

These are voluntary consensus frameworks, not binding law. They help a health AI
deployment evidence the binding instruments (the HIPAA Security Rule at 45 CFR Part 164
and the ONC HTI-1 predictive DSI certification criterion at 45 CFR 170.315(b)(11)), but
satisfying them does not by itself guarantee or certify legal compliance.

NIST SP 800-66 Revision 2 (February 2024) is a resource guide that maps each HIPAA
Security Rule standard and implementation specification, across the administrative
(45 CFR 164.308), physical (164.310), and technical (164.312) safeguards, to NIST
Cybersecurity Framework subcategories and to NIST SP 800-53 Revision 5 controls. The
authoritative row-by-row crosswalk is published in NIST's Cybersecurity and Privacy
Reference Tool (CPRT) so it can be consumed machine-readably and updated independently;
a control plane should read it live rather than hardcode control numbers. NIST states the
guide is voluntary and does not ensure or guarantee Security Rule compliance.

The NIST AI Risk Management Framework 1.0 (AI 100-1, January 2023) organizes AI risk
management into four functions — GOVERN (cross-cutting), MAP, MEASURE, and MANAGE — and
seven trustworthy-AI characteristics. For a health AI deployment, MEASURE 2.10 (Privacy)
and MEASURE 2.11 (Fairness and bias) are the most relevant subcategories. The Generative AI
Profile (AI 600-1, July 2024) enumerates twelve generative-AI risk categories; for health,
Data Privacy, Confabulation, and Harmful Bias and Homogenization are the minimum coverage
set. Both are explicitly voluntary.

The Coalition for Health AI Applied Model Card (Draft V0.1, November 2024) is a voluntary
transparency instrument with a machine-readable schema of nine sections — BasicInfo,
ReleaseInfo, ModelSummary, UsesAndDirections, Warnings, TrustIngredients, KeyMetrics,
Resources, Bibliography. Its Key Metrics section requires three pillars (Usefulness/Usability/
Efficacy, Fairness/Equity, Safety/Reliability), each reporting goal, result, interpretation,
test type, testing data, and validation. The card is annotated with 45 CFR 170.315(b)(11)
citations and is designed to support meeting the HTI-1 predictive DSI source attributes, but
it does not by itself legally satisfy or certify HTI-1. A control plane can evaluate model-card
completeness against this schema and retain the card as transparency evidence.
