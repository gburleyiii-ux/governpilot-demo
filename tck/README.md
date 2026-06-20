# GAGS Technology Compliance Kit (TCK)

An **implementation-independent** conformance kit for the GovernPilot AI Governance
Standard (GAGS). It tests *any* candidate implementation — not just GovernPilot — by
exercising its HTTP API and merging an attestation manifest for the requirements that
are not observable over the wire.

This is the artifact that lets GAGS become a **standard** rather than a vendor framework:
a second, independent implementation can run the same kit and publish a comparable,
signed report.

## How conformance is decided

Each GAGS requirement (`tck-profile.json`) is one of two classes:

- **black-box** — verified by calling the candidate's API and asserting observable
  behavior (e.g. an auditor cannot approve a gate; a tool registry records write-scope
  and approval class; a cross-tenant read returns 404). No source access required.
- **attestation** — a property that cannot be seen over the wire (e.g. CI gating,
  boot-time signing-key refusal, the contents of an eval suite). The implementer
  supplies an **attestation manifest** declaring conformance and pointing to evidence.
  The TCK confirms *coverage*, not the attestation's truth — independent assessment is
  a separate step.

A candidate is **TCK-CONFORMANT** when every black-box L1 MUST check passes **and**
every attestation-class requirement is covered by the manifest.

## Run it against any implementation

```bash
node tck/run-tck.mjs \
  --base-url https://your-implementation.example.com/api \
  --attestation path/to/your-attestation.json \
  --out tck-report.json
```

The candidate must accept the GAGS reviewer/tenant headers used by the reference API
(`x-sentinelops-role`, `x-sentinelops-reviewer`, `x-sentinelops-tenant`) or an
equivalent the kit is configured for. See `docs/architecture/openapi.json` for the
contract the black-box checks assume.

Flags: `--tenant-a` / `--tenant-b` (isolation test tenants), `--out` (report path).
Set `SENTINELOPS_SIGNING_SECRET` to sign the report with a real key (otherwise it is
labeled `dev-hmac-sha256`).

## Attestation manifest

See `governpilot-attestation.json` for the reference implementation's manifest. Each
entry is `{ "attested": true, "evidence": "<pointer to the evidence>" }` keyed by GAGS
requirement id. An implementer fills this in for every attestation-class requirement.

## Self-test

`npm run tck:check` spawns the GovernPilot reference implementation and runs this kit
against it with `governpilot-attestation.json`, asserting it is TCK-CONFORMANT — proof
that the reference implementation passes its own open kit.

## Honest boundary

The TCK verifies observable behavior and attestation coverage. It is **not** an
independent assessment, an authorization, or legal advice. Conformance reported here is
self-run unless a third party runs the kit and publishes the signed report.
