# Health ONC HTI-1 Decision Support Intervention Standard

The ONC/ASTP HTI-1 final rule (89 FR 1192, Jan 9 2024) adopts the Decision Support
Interventions (DSI) certification criterion at 45 CFR 170.315(b)(11), replacing the older
clinical decision support criterion. It is in force: certified Health IT had to provide the
DSI criterion to customers by December 31, 2024, and the maintenance-of-certification
requirement at 45 CFR 170.402(b)(4) applies from January 1, 2025.

HTI-1 distinguishes evidence-based DSIs from predictive DSIs. A predictive DSI is technology
that supports decision-making based on algorithms or models that derive relationships from
training data and produce a prediction, classification, recommendation, evaluation, or
analysis. Predictive DSIs carry the heavier obligations.

For each predictive DSI it supplies, a certified module must support 31 source attributes
(45 CFR 170.315(b)(11)(iv)(B)) across nine categories: details and output; purpose; cautioned
out-of-scope use; development details and input features; fairness in development; external
validation; quantitative measures of performance (validity and fairness in internal, local,
and external data); ongoing maintenance; and update/validation schedule. Evidence-based DSIs
require 13 source attributes.

The module must let a limited set of identified users access plain-language descriptions of
these attributes, record them, change them, and add additional attributes for predictive DSIs
the developer did not supply (45 CFR 170.315(b)(11)(v)). Intervention Risk Management
(45 CFR 170.315(b)(11)(vi)) requires risk analysis across eight characteristics — validity,
reliability, robustness, fairness, intelligibility, safety, security, and privacy — plus risk
mitigation and governance of how data are acquired, managed, and used. A summary must be
publicly disclosed under 45 CFR 170.523(f)(1)(xxi).

A control plane should evidence: 31-attribute completeness for supplied predictive DSIs, the
four access capabilities, an IRM artifact covering all eight characteristics, and a current
public disclosure.
