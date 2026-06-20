# SentinelOps AI OPA/Rego Compatibility

SentinelOps exports the existing JSON policy-as-code bundle as inspectable OPA/Rego modules. The JSON bundle remains the local runtime source of truth unless an approved OPA sidecar is deployed.

## API Surface

- `GET /api/policies/rego`
  - Returns compatibility metadata, supported operators, rule mappings, generated Rego modules, and OPA usage guidance.

## Generated Packages

- `sentinelops.runtime`
  - Maps reviewer identity, reviewer role, decision state, trace linkage, required evidence, and gate-state alignment rules.
- `sentinelops.infrastructure`
  - Maps GovCloud Terraform checks for private networking, internal ALB, VPC endpoints, encrypted evidence storage, recoverability, and reduced runtime mutation.

## Supported Operators

- `notEmpty`
- `equals`
- `equalsFact`
- `oneOf`
- `includesAll`
- `contains`
- `containsAll`

## Usage Shape

The generated Rego expects this input shape:

```json
{
  "run": {},
  "decision": {},
  "files": {
    "infra/terraform/govcloud/main.tf": "..."
  }
}
```

Example OPA command:

```bash
opa eval --data opa/sentinelops --input input.json data.sentinelops.runtime.allow
```

## Verification

Run:

```bash
npm run rego:check
```

The smoke test proves:

- runtime and infrastructure packages are generated;
- all current policy operators map to Rego-compatible expressions;
- unsupported conditions are reported explicitly;
- OPA usage guidance is present.
