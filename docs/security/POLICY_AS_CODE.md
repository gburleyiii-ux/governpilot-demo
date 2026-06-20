# SentinelOps AI Policy-as-Code

SentinelOps includes a declarative policy bundle at `server/policies/policy-as-code.json`.

## Runtime Rules

Runtime rules evaluate the active assessment run and reviewer decision before approval evidence is recorded. They verify:

- reviewer identity, reviewer role, and decision state;
- run ID, trace ID, and approval gate ID linkage;
- required action-group evidence;
- persisted gate state alignment with the reviewer decision.

These checks are merged into the approval policy result and exported in evidence packets.

## Policy Intelligence Boundary

`GET /api/policies/intelligence` reports the official source registry, provenance expectations, change review queue, and no-auto-enforcement posture for real policy sources.

The policy intelligence layer does not make new policy text enforceable by itself. A customer-approved policy owner must accept the interpretation, scope, evidence requirement, and effective date before a source change becomes part of the active policy-as-code bundle.

## OPA/Rego Compatibility

`GET /api/policies/rego` exports the same JSON policy-as-code bundle as generated Rego modules for enterprise policy-library review.

- `sentinelops.runtime` maps reviewer, decision, trace, gate, and required-evidence rules.
- `sentinelops.infrastructure` maps GovCloud Terraform controls.
- The local JSON bundle remains the runtime source of truth unless an approved OPA sidecar is deployed.

## Infrastructure Rules

Infrastructure rules evaluate the GovCloud Terraform skeleton for pilot-readiness controls:

- ECS tasks use private networking and no public IPs;
- the load balancer is internal only;
- AWS service access uses private VPC endpoints;
- evidence storage and the approval ledger are encrypted and recoverable;
- runtime mutation and remote shell access are minimized.

## Verification

Run:

```bash
npm run policy:check
npm run policy:intel-check
npm run rego:check
```

The smoke test proves:

- a valid reviewer approval passes runtime policy-as-code;
- missing reviewer identity and missing rollback evidence fail runtime policy-as-code;
- the GovCloud Terraform skeleton passes the infrastructure policy bundle.
- official policy source registry, provenance hashes, human review, and no-auto-enforcement posture are present.
- the current policy operators export to Rego-compatible expressions with zero unsupported conditions.
