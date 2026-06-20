# GovernPilot — Governed Control Plane for Agentic AI (proof-of-work)

> Public, employer-facing copy. A **working proof-of-work** demonstrating engineering
> judgment around governing AI in regulated and cleared environments. Runs locally in
> deterministic mode — no production authorization, customer data, or classified data.
> See `CURATION_NOTE.md` for what was intentionally omitted.

Version 0.22.0. Built by Grant Burley III.

## What this demonstrates

Most AI demos stop at "the model works." This builds everything **around** the model that a
federal or regulated buyer requires — and proves it with an executable standard.

- **Human-in-the-loop approval gates** before any write-capable tool action.
- **Server-enforced RBAC** across local, JWT, and **OIDC/JWKS** identity.
- **Tamper-evident audit**: append-only hash-chained ledger, content-addressed evidence.
- **Policy-as-code** with an **OPA/Rego** export; a model gateway with **cost/token/latency
  guardrails**; **multi-tenant isolation**; an **eval harness** that blocks runs on
  prompt-injection / retrieval-drift.
- **GAGS** — an open AI-governance specification with a machine-checkable conformance suite
  (48 requirements; L1 34/34 MUST + L2 14/14; signed; CI-gated).
- **TCK** — an implementation-independent **conformance test kit** (`tck/`).
- **Compliance automation** — generates SSP statements (34 NIST SP 800-53 controls), a
  POA&M, and a continuous-monitoring plan, validated against NIST's published 800-53 catalog.

## Run it (2 minutes)

```bash
npm install
npm run api      # terminal 1 — local API (deterministic mode, no keys)
npm run dev      # terminal 2 — dashboard at the printed Vite URL
```

## See the governance, proven

```bash
npm run conformance      # GAGS suite: L1 34/34 MUST + L2 14/14, signed report
npm run tck:check        # reference impl passes its own open conformance kit
npm run crosswalk:check  # 800-53 controls verified against NIST's catalog
npm run compliance:generate   # emits SSP / POA&M / con-mon to docs/compliance/
```

## Stack

React 18 + Vite + TypeScript frontend; dependency-free Node API; OpenAI Agents SDK adapter
with deterministic-local fallback. AWS GovCloud-ready Terraform skeleton in `infra/`.

## Honest boundary

Proof-of-work for portfolio and interview review. Conformance is self-asserted; legal items
are status-labeled and never presented as current law when proposed or not yet effective.
Not legal advice.
