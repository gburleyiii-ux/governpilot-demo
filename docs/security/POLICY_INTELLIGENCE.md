# SentinelOps AI Policy Intelligence

SentinelOps separates policy source monitoring from policy enforcement.

The app can maintain an official source registry, detect changes, and stage policy updates for review. It must not automatically treat a new source change as enforceable policy until a customer-approved owner accepts the interpretation, scope, effective date, and evidence requirements.

## Runtime Surface

- Endpoint: `GET /api/policies/intelligence`
- Implementation: `server/policy-intelligence.mjs`
- Verification: `npm run policy:intel-check`
- Dashboard surface: `Controls` tab, `Policy Intelligence`

## Source Registry

The first real-world source registry includes:

- NIST SP 800-53 OSCAL catalog
- FedRAMP automation and OSCAL baselines
- eCFR API
- Federal Register API
- CISA Known Exploited Vulnerabilities catalog
- DISA STIG library
- customer-owned policy vault

Each source record must preserve:

- official source URL
- machine-readable URL when available
- source authority
- update cadence
- customer owner role
- retrieval timestamp
- SHA-256 snapshot hash
- required approval path

## Trust Model

The customer should not trust a policy because SentinelOps says it is true.

The customer should trust the process because SentinelOps can show:

- where the policy came from
- when it was retrieved
- whether the source changed
- which version was approved
- who approved the interpretation
- which controls became active
- what evidence was checked
- which AI decisions used that policy version

## Change Process

1. Fetch approved official sources on a scheduled watcher.
2. Store the raw source snapshot and SHA-256 hash.
3. Diff the new snapshot against the last approved version.
4. Create a review queue item for changed wording, new controls, removed controls, effective-date changes, or evidence changes.
5. Route the item to the assigned policy owner.
6. Activate only approved mappings in `server/policies/policy-as-code.json` or the customer policy store.
7. Export active policy version evidence with every AI decision.

## Enforcement Boundary

`autoEnforceNewPolicy` must remain `false` unless a customer explicitly approves a different operating model in writing.

Live source fetching requires:

- `SENTINELOPS_POLICY_INTEL_MODE=live`
- `SENTINELOPS_POLICY_SOURCE_FETCH_APPROVED=true`
- `SENTINELOPS_POLICY_REVIEW_OWNER=<customer owner>`

Without those approvals, live source mode must report `review-required`.

