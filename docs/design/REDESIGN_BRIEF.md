# GovernPilot Comprehension-First Redesign — Implementation Brief

Single source of truth for the redesign. Synthesized from the IA, visual, and content
design passes. Goal (owner's words): a person with no prior knowledge can look at the
site and explain to a class what it does and all its functions. Frontend only
(`src/App.tsx`, `src/styles.css`) — no backend/conformance impact. Brand = **GovernPilot**
(SentinelOps only as engine lineage inside Proof Package).

## North star
**GovernPilot is the control tower for AI:** before an AI system does real work in a
regulated/government setting, a human approves it, safety checks run, and it produces
tamper-proof evidence. Three pillars, repeated everywhere: **Human Approves · Checks Run ·
Proof Kept.** The nav is the story: **Define → Check → Approve → Prove.**

## The 6-section IA (regroup the 11 capabilities; nothing removed)
1. **Overview** — landing/default. "What this is + readiness + where to go."
2. **Govern** — policies, rules-as-code, source provenance *(what the AI is allowed to do)*.
3. **Safety** — evals + red-team/prompt-injection *(test it and try to break it)*.
4. **Approvals** — human approval gates + the assessment run being approved *(a human signs off)*.
5. **Proof & Evidence** — tamper-evident ledger + evidence export *(proof for auditors)*.
6. **AI Runtime & Operations** — model gateway, cost guardrails, knowledge/retrieval, observability/alerts *(the engine room)*.
7. **Access & Admin** — RBAC/identity, settings/storage/deployment.
Plus **Personnel Vetting (Trusted Workforce/NBIS)** as a use-case journey (walks Govern→Approve→Prove), and **Proof Package / Case Study / Demo** as portfolio/utility.

Overview section-card order mirrors the 4 steps: Govern, Safety, Approvals, Proof & Evidence, then AI Runtime & Ops, Access & Admin.

## PRIORITY 1 (MUST) — The Overview/landing (the centerpiece)
Replace the current guided-mode landing with a comprehension-first Overview, top to bottom:
1. **Hero** — dark surface. Eyebrow `GOVERNPILOT · AI GOVERNANCE`. H1 (one sentence):
   *"Run AI agents under human-approved governance — with exportable proof."* Sub (≤56ch
   plain): *"GovernPilot is the control tower for AI: before an AI takes real action in
   regulated work, a person approves it, safety checks run, and every decision is sealed
   as tamper-proof evidence."* Three pillar chips: **Human Approves · Checks Run · Proof
   Kept.** Two CTAs: primary "Walk me through it" (guided stepper), secondary "Explore the
   console". Right rail: 3 honest MetricStats (e.g. evidence-ready, eval pass, approval state).
2. **How it works (4 steps)** — band of 4 StepItems: **1 Define** the AI task + rules →
   **2 Check** with safety + red-team evals → **3 Approve** at a human gate → **4 Prove**
   with sealed, exportable evidence.
3. **Explore the platform (SECTION-CARD GRID)** — 6 cards (the 6 sections), each: icon,
   plain name, one-line purpose, up to 4 "inside" chips, a count + arrow. This is the
   visual table of contents. Plain names/purposes from the content layer below.
4. **Readiness band** — 3–4 real live numbers so it reads as a working system.
5. **Proof band** — "This is real": links to Approval Ledger, hash-chain verify, OPA/Rego
   export, full audit bundle, public Case Study + Demo Video.
6. **60-second explainer** — include this paragraph verbatim in a readable callout so a
   newcomer can read it aloud: *"Imagine a company wants to use AI that doesn't just answer
   questions — it can actually do things, like update records or send information. That's
   powerful, and in government work it's risky. GovernPilot is the safety system in front of
   that AI, like mission control in front of a plane. Before the AI acts, it lays out the
   rules in plain checkable form, runs safety tests and even tries to trick the AI on
   purpose, stops any risky action at a gate where a responsible person must approve it, and
   saves sealed, tamper-proof proof of everything — so an auditor can later confirm the AI
   was used safely and by the book. In short: GovernPilot makes AI prove it's safe, makes a
   human sign off, and keeps the receipts."*
7. **Frameworks footer** — NIST AI RMF · NIST 800-53 · FedRAMP · OMB AI memos · CMMC · GAGS.
   Honest maturity line: *"Reference implementation is single-tenant and self-assessed
   (Level L1); designed to map onto these frameworks, not itself a federal authorization."*

## PRIORITY 2 (MUST) — Plain language everywhere
Relabel the sidebar to the 6 plain-language section names + one-line descriptions. On every
section page, render an **orientation header** (eyebrow + plain H1 + one-sentence purpose)
ABOVE the first data panel. Capability plain-names to use in cards/labels:
- Review Runs · Approval Gates · Rules as Code · Rule Sources & History · Safety Tests &
  Attack Drills · Tamper-Proof Record & Evidence Export · Roles & Sign-In · AI Provider
  Switchboard · Spending & Speed Limits · Sourced Answers · Health Monitor & Alerts ·
  Personnel Vetting Readiness. Keep expert terms in parentheses/secondary text, never lead with them.

## PRIORITY 3 (SHOULD) — Visual hierarchy tokens (calms the whole app)
Add to `:root` and adopt: type scale (`--fs-050`…`--fs-900`, body=`--fs-300`/14px),
weights (`--fw-regular/medium/semibold/bold`), line-heights, letter-spacing; spacing scale
(`--sp-1`…`--sp-12`, 4px base); 3-tier elevation (`--elev-0/1/2/hover`, `--ring-focus`,
`--ring-primary`). Define one `.eyebrow` class (fs-050, fw-bold, uppercase, tracking, `--soft`)
and replace the scattered 10–11px uppercase micro-caps. Elevation contract: primary panel
`--elev-2`+ring, standard `--elev-1`, nested rows flat `--elev-0` on `--surface-2`. Unify
near-duplicate pills into one `.status-pill` (is-pass/is-active/is-wait/is-fail/is-info) and
label/value cells into one `.metric-stat` where practical.

## PRIORITY 4 (SHOULD) — Tame the dense pages
Apply progressive disclosure to **Policies (8 panels)** and **Operations (9 panels)** (and
Model Gateway): one primary panel open; the rest become native `<details>`/`<summary>`
`.disclosure` rows (chevron + title + count + status pill), default-collapsed EXCEPT panels
with amber/red status (auto-open). Remove any remaining duplicate panels.

## Hard constraints
- Keep ALL real functionality reachable — regroup/relabel, never delete.
- `npm run build` MUST pass (tsc -b && vite build). Keep semantic HTML, visible focus,
  WCAG AA contrast (reuse `--soft` #66707d, `--amber-text` #8a5a0c).
- No edits outside `src/`. Do not touch server/, scripts/, standard/, docs/standard/.
- Brand = GovernPilot. Honest truth-boundary copy preserved.
