# Health HIPAA Safeguards Standard

The HIPAA Security Rule (45 CFR Part 164, Subpart C) binds covered entities and business
associates ("regulated entities"). A governance platform that touches electronic PHI is a
business associate and must reflect that posture. The General Rules at 45 CFR 164.306(a)
require protecting the confidentiality, integrity, and availability of all ePHI a regulated
entity creates, receives, maintains, or transmits.

Access Control (45 CFR 164.312(a)) carries Unique User Identification (Required), an
Emergency Access Procedure / break-glass (Required), Automatic Logoff (Addressable), and
Encryption/Decryption (Addressable). Every AI action affecting ePHI must be attributable to
a unique user, break-glass access must itself be recorded, and sessions should time out.

Audit Controls (45 CFR 164.312(b)) require mechanisms to record and examine activity in
systems containing ePHI; the rule prescribes no specific fields or cadence, leaving that to
risk analysis. Read together with the Integrity standard (45 CFR 164.312(c)(1)/(c)(2),
including an addressable mechanism such as checksums or digital signatures to corroborate
that ePHI has not been improperly altered), these ground tamper-evident audit evidence for
AI actions on PHI — satisfied here by the hash-chained approval ledger.

Forward-looking note: the January 6, 2025 HIPAA Security Rule NPRM proposes to make
encryption and multi-factor authentication mandatory and to require a technology asset
inventory and ePHI network map reviewed at least every 12 months. This is proposed, not
final; treat it as a configurable, anticipatory control, not a current legal obligation.
