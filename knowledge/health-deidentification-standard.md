# Health De-identification Standard

PHI may be treated as de-identified only by one of the two lawful HIPAA methods at
45 CFR 164.514(b): Expert Determination (164.514(b)(1)) or Safe Harbor (164.514(b)(2)).
There is no third pathway; a Limited Data Set still contains identifiers and requires a
Data Use Agreement, so it is not de-identification.

Safe Harbor requires removal of the 18 identifier categories of the individual and of
relatives, employers, and household members: names; geographic subdivisions smaller than a
state (ZIP truncated to 3 digits under the 20,000-person rule); all date elements except
year and ages over 89; phone; fax; email; SSN; medical record numbers; health-plan
beneficiary numbers; account numbers; certificate/license numbers; vehicle identifiers;
device identifiers; URLs; IP addresses; biometric identifiers; full-face photographs; and
any other unique identifying number, characteristic, or code. Safe Harbor also requires no
actual knowledge that the residual data could re-identify an individual.

Expert Determination requires a person with appropriate statistical/scientific knowledge to
determine the re-identification risk is very small and to document the methods and results;
that documentation must be retained and made available to OCR on request.

A health AI control plane must enforce one method, scrub or block the 18 categories before
treating data as de-identified, and retain the de-identification evidence in the audit record.
