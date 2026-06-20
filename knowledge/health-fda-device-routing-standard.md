# Health FDA Device Routing Standard

Whether a health AI is an FDA-regulated device turns on the four conjunctive Non-Device
Clinical Decision Support criteria in section 520(o)(1)(E) of the Federal Food, Drug, and
Cosmetic Act, as interpreted by FDA's Clinical Decision Support Software guidance. A
software function is excluded from the device definition (Non-Device CDS) only if it meets
all four criteria. Failing any one criterion makes the function a regulated medical device.

The four criteria, in plain terms: (1) it does not acquire, process, or analyze a medical
image or signal from an in-vitro diagnostic or a signal-acquisition device; (2) it displays,
analyzes, or prints medical information about a patient or other medical information; (3) it
provides recommendations to a health care professional (rather than a specific directive or
output to drive treatment); and (4) it enables the professional to independently review the
basis for the recommendations, so they do not rely primarily on it. Administrative and
operational tools (documentation, scheduling, coding, prior-authorization support) typically
satisfy all four and stay Non-Device. Diagnostic or predictive tools that drive clinical
action, or that the clinician cannot independently review, typically fail a criterion.

A health AI control plane should route every use case through this four-criterion test. If
all four are met, the administrative track applies (HIPAA controls). If any one fails, the
use case is on the FDA device track, where Good Machine Learning Practice, a Predetermined
Change Control Plan for model changes, and postmarket performance and bias monitoring apply.
The routing determination itself is audit evidence and must be recorded.
