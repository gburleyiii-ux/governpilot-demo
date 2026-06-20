import {
  Activity,
  Archive,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Compass,
  DatabaseZap,
  Download,
  FileCheck2,
  Gauge,
  HeartPulse,
  KeyRound,
  ListChecks,
  LockKeyhole,
  Stethoscope,
  Play,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
  UserCheck,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createRun,
  decideRunGate,
  dispatchObservabilityAlerts,
  exportRunEvidence,
  getActivePolicy,
  getAlertRoutingStatus,
  getCostGuardrails,
  getFullAuditExport,
  getLatestEvalReport,
  getLatestRun,
  getLiveDeliveryReadiness,
  getModelGatewayStatus,
  getObservabilitySummary,
  getPolicyIntelligenceStatus,
  getRbacRoles,
  getRegoCompatibility,
  getRetrievalReadiness,
  getSystemInfo,
  getTrustedWorkforceReadiness,
  runAgentReview,
  runEvalPack,
} from "./lib/api";
import { buildEvidencePacket, createAssessmentRun, decideGate, rerunEvalPack } from "./lib/sentinelEngine";
import type {
  AgentReview,
  AgentStatus,
  ActivePolicy,
  AlertRoutingStatus,
  ApiRunResponse,
  ApprovalRecord,
  AssessmentRun,
  CostGuardrails,
  EvalStatus,
  EvalReport,
  EvidenceState,
  GateState,
  LiveDeliveryReadiness,
  ModelGatewayStatus,
  ObservabilitySummary,
  PolicyCheck,
  PolicyIntelligenceStatus,
  RbacPermission,
  RbacRole,
  RegoCompatibility,
  RetrievalReadiness,
  ReviewerActor,
  ReviewerRoleId,
  Severity,
  SystemInfo,
  TrustedWorkforceReadiness,
} from "./lib/types";

// ---------------------------------------------------------------------------
// 6-section comprehension-first IA. Each section is a plain-language group that
// maps onto the existing tab targets ("subTabs"). Nothing is removed — every
// prior capability stays reachable via its section.
// ---------------------------------------------------------------------------
type SectionId = "Overview" | "Govern" | "Safety" | "Approvals" | "Proof & Evidence" | "AI Runtime & Operations" | "Access & Admin";

type SectionDef = {
  id: SectionId;
  name: string;
  description: string;
  purpose: string;
  icon: typeof ShieldCheck;
  // First subTab is the section landing target.
  subTabs: { tab: string; label: string }[];
  insideChips: string[];
};

const sectionDefs: SectionDef[] = [
  {
    id: "Overview",
    name: "Overview",
    description: "What this is and where to go",
    purpose: "Start here: what GovernPilot does, how ready it is, and where every function lives.",
    icon: Compass,
    subTabs: [{ tab: "Overview", label: "Overview" }],
    insideChips: ["What it is", "Readiness", "Proof links"],
  },
  {
    id: "Govern",
    name: "Govern",
    description: "What the AI is allowed to do",
    purpose: "Define and review the rules the AI must follow — written in plain, checkable form with sourced authority.",
    icon: ShieldCheck,
    subTabs: [
      { tab: "Policies", label: "Rules as Code" },
      { tab: "Personnel Vetting", label: "Personnel Vetting Readiness" },
      { tab: "Health", label: "Health (HIPAA + FDA)" },
    ],
    insideChips: ["Rules as Code", "Personnel Vetting", "Health (HIPAA + FDA)"],
  },
  {
    id: "Safety",
    name: "Safety",
    description: "Test it and try to break it",
    purpose: "Run safety tests and deliberate attack drills (prompt injection, red-team) before the AI is trusted.",
    icon: Gauge,
    subTabs: [{ tab: "Safety Evals", label: "Safety Tests & Attack Drills" }],
    insideChips: ["Safety Tests", "Attack Drills", "Reviewer Guidance"],
  },
  {
    id: "Approvals",
    name: "Approvals",
    description: "A human signs off",
    purpose: "See the assessment run being reviewed and the human approval gate that must clear before any real action.",
    icon: ClipboardCheck,
    subTabs: [
      { tab: "Command Center", label: "Review Runs" },
      { tab: "Approvals", label: "Approval Gates" },
    ],
    insideChips: ["Review Runs", "Approval Gates", "Signatures"],
  },
  {
    id: "Proof & Evidence",
    name: "Proof & Evidence",
    description: "Proof for auditors",
    purpose: "Export the tamper-evident record: who approved what, what was checked, and a verifiable audit bundle.",
    icon: Archive,
    subTabs: [{ tab: "Audit Evidence", label: "Tamper-Proof Record & Evidence Export" }],
    insideChips: ["Tamper-Proof Record", "Evidence Export", "Audit Bundle"],
  },
  {
    id: "AI Runtime & Operations",
    name: "AI Runtime & Operations",
    description: "The engine room",
    purpose: "Inspect how the AI runs: provider switchboard, spending and speed limits, sourced answers, and health monitoring.",
    icon: Server,
    subTabs: [
      { tab: "Model Gateway", label: "AI Provider Switchboard" },
      { tab: "Knowledge", label: "Sourced Answers" },
      { tab: "Operations", label: "Health Monitor & Alerts" },
    ],
    insideChips: ["Provider Switchboard", "Spending & Speed Limits", "Sourced Answers", "Health Monitor"],
  },
  {
    id: "Access & Admin",
    name: "Access & Admin",
    description: "Who can do what",
    purpose: "Manage roles and sign-in, runtime mode, storage, and deployment evidence for the platform.",
    icon: KeyRound,
    subTabs: [{ tab: "Settings", label: "Roles & Sign-In" }],
    insideChips: ["Roles & Sign-In", "Storage", "Deployment"],
  },
];

// Map each tab target back to the section it belongs to (for sidebar active-state).
const tabToSection: Record<string, SectionId> = {};
for (const section of sectionDefs) {
  for (const sub of section.subTabs) {
    tabToSection[sub.tab] = section.id;
  }
}
// Proof Package is portfolio/utility — reachable, grouped under Overview's proof band.
tabToSection["Proof Package"] = "Overview";

const allTabs = sectionDefs.flatMap((section) => section.subTabs.map((sub) => sub.tab));

const navAliases: Record<string, string> = {
  Runs: "Command Center",
  Controls: "Policies",
  Workforce: "Personnel Vetting",
  Gateway: "Model Gateway",
  Healthcare: "Health",
  Retrieval: "Knowledge",
  Evals: "Safety Evals",
  Evidence: "Audit Evidence",
  Observability: "Operations",
  "Case Study": "Proof Package",
};

const proofNavItem = {
  label: "Proof Package",
  description: "Employer-facing case study and artifacts",
  icon: FileCheck2,
};
const ProofIcon = proofNavItem.icon;

const pageMeta: Record<string, { eyebrow: string; title: string; secondary?: string; description: string; fit: string }> = {
  "Command Center": {
    eyebrow: "Approvals · Review Runs",
    title: "Review Runs",
    secondary: "assessment run being approved",
    description:
      "The AI task under review: what it did, what needs a human approval, and where the evidence is produced — all in one timeline.",
    fit: "Use this to see the current run, resolve the approval gate, and jump to the right review area.",
  },
  Approvals: {
    eyebrow: "Approvals · A human signs off",
    title: "Approval Gates",
    secondary: "approval ledger",
    description: "Who approved what and why: reviewer decisions, signatures, and policy status before any write-capable AI action.",
    fit: "Use when a reviewer, compliance owner, or auditor needs to confirm who signed off and why.",
  },
  Policies: {
    eyebrow: "Govern · What the AI is allowed to do",
    title: "Rules as Code",
    secondary: "policies, rules-as-code, OPA/Rego",
    description: "The AI's rules in plain, checkable form — with the official sources behind them and an export for enterprise review.",
    fit: "Use when policy owners need to prove controls are sourced, reviewed, and not auto-enforced.",
  },
  "Personnel Vetting": {
    eyebrow: "Govern · Use-case journey",
    title: "Personnel Vetting Readiness",
    secondary: "Trusted Workforce / NBIS",
    description: "A cleared-workforce example modeled end to end as policy, procedure, process, work instructions, and evidence.",
    fit: "Use for cleared-contractor workflows where FSO/SSO review, data boundaries, and human-only decisions matter.",
  },
  Health: {
    eyebrow: "Govern · Sector journey",
    title: "Health (HIPAA + FDA)",
    secondary: "HIPAA Business Associate · FDA Non-Device CDS",
    description:
      "Govern healthcare AI under HIPAA and FDA rules — with proof. Every requirement is tagged by legal status, and GovernPilot governs the decision while storing no live PHI.",
    fit: "Use for healthcare AI buyers (government health, hospitals, health-tech/SaMD, payers) who need HIPAA controls and an FDA device-track check before a pilot.",
  },
  "Model Gateway": {
    eyebrow: "AI Runtime & Operations · The engine room",
    title: "AI Provider Switchboard",
    secondary: "model gateway, cost guardrails",
    description: "How the AI is routed to a model provider, with deterministic fallback plus spending and speed limits before any live run.",
    fit: "Use when technical owners need to review model paths, cost limits, latency gates, and provider boundaries.",
  },
  Knowledge: {
    eyebrow: "AI Runtime & Operations · The engine room",
    title: "Sourced Answers",
    secondary: "retrieval, citations, RAG",
    description: "Where answers come from: retrieval readiness, citation coverage, corpus boundaries, and the path to vector search.",
    fit: "Use when reviewers need to trust where answers come from and how evidence is cited.",
  },
  "Safety Evals": {
    eyebrow: "Safety · Test it and try to break it",
    title: "Safety Tests & Attack Drills",
    secondary: "evals, red-team, prompt injection",
    description: "Safety test packs plus deliberate attack drills and reviewer guidance before a pilot is treated as controlled.",
    fit: "Use before approving a workflow or after policy/runtime changes that should be retested.",
  },
  "Audit Evidence": {
    eyebrow: "Proof & Evidence · Proof for auditors",
    title: "Tamper-Proof Record & Evidence Export",
    secondary: "evidence packet, audit bundle, signed hashes",
    description: "The sealed record an auditor can verify: exportable evidence packets, audit events, signed hashes, and a full bundle.",
    fit: "Use when a buyer, auditor, or internal owner asks for proof rather than a verbal claim.",
  },
  Operations: {
    eyebrow: "AI Runtime & Operations · The engine room",
    title: "Health Monitor & Alerts",
    secondary: "SLOs, alert routing, delivery readiness",
    description: "How the running system is watched: runtime SLOs, alert routing, live delivery readiness, SIEM handoff, and event history.",
    fit: "Use when the pilot needs to show how it will be monitored, routed, and safely escalated.",
  },
  "Proof Package": {
    eyebrow: "Portfolio · Proof of work",
    title: "Proof Package",
    secondary: "case study, demo, architecture proof",
    description: "Employer-facing project story, architecture proof, demo materials, and the truthful claim boundary.",
    fit: "Use this for interviews, partner review, and external proof-of-work, not day-to-day operations.",
  },
  Settings: {
    eyebrow: "Access & Admin · Who can do what",
    title: "Roles & Sign-In",
    secondary: "RBAC, identity, storage, deployment",
    description: "Reviewer roles and identity posture, runtime mode, storage path, and deployment evidence for the platform.",
    fit: "Use when configuring who can do what and how the app is connected.",
  },
};

const commandDomains = [
  {
    label: "Governance",
    target: "Policies",
    detail: "Review policies, source changes, required evidence, and human approval gates.",
    metric: "Controls and source trust",
    icon: ShieldCheck,
  },
  {
    label: "AI Runtime",
    target: "Model Gateway",
    detail: "Inspect model routing, cost limits, retrieval grounding, and safety evaluations.",
    metric: "Gateway, knowledge, evals",
    icon: TerminalSquare,
  },
  {
    label: "Operations",
    target: "Operations",
    detail: "Check SLOs, alerts, delivery readiness, audit events, and escalation posture.",
    metric: "SLO and alert readiness",
    icon: Activity,
  },
  {
    label: "Personnel Vetting",
    target: "Personnel Vetting",
    detail: "Map Trusted Workforce/NBIS steps to procedures, work instructions, and evidence.",
    metric: "Domain-specific readiness",
    icon: UserCheck,
  },
];

const deploymentEvidence = [
  { label: "GovCloud Terraform", path: "infra/terraform/govcloud" },
  { label: "Deployment Architecture", path: "docs/architecture/GOVCLOUD_DEPLOYMENT.md" },
  { label: "Model Gateway", path: "docs/architecture/MODEL_GATEWAY.md" },
  { label: "Retrieval Readiness", path: "docs/architecture/RETRIEVAL_BACKENDS.md" },
  { label: "Retrieval Index", path: "docs/architecture/RETRIEVAL_INDEX.md" },
  { label: "Auth Model", path: "docs/security/AUTH_MODEL.md" },
  { label: "Policy-as-Code", path: "docs/security/POLICY_AS_CODE.md" },
  { label: "Policy Intelligence", path: "docs/security/POLICY_INTELLIGENCE.md" },
  { label: "OPA/Rego Compatibility", path: "docs/security/REGO_COMPATIBILITY.md" },
  { label: "Audit Integrity", path: "docs/security/AUDIT_INTEGRITY.md" },
  { label: "Data Protection", path: "docs/security/DATA_PROTECTION.md" },
  { label: "Security Audit", path: "docs/security/SECURITY_AUDIT.md" },
  { label: "Threat Model", path: "docs/security/THREAT_MODEL.md" },
  { label: "Observability", path: "docs/operations/OBSERVABILITY.md" },
  { label: "L2 Live Infrastructure Plan", path: "docs/operations/L2_LIVE_INFRASTRUCTURE_PLAN.md" },
];

const portfolioArtifacts = [
  { label: "GAGS Standard (GAGS-CORE)", path: "docs/standard/GOVERNPILOT_AI_GOVERNANCE_STANDARD.md" },
  { label: "GAGS Health Profile", path: "docs/standard/GAGS_HEALTH_PROFILE.md" },
  { label: "Conformance Map", path: "standard/conformance-map.json" },
  { label: "SSP Control Implementations", path: "docs/compliance/SSP_CONTROL_IMPLEMENTATIONS.md" },
  { label: "Continuous Monitoring Plan", path: "docs/compliance/CONTINUOUS_MONITORING_PLAN.md" },
  { label: "Threat Model", path: "docs/security/THREAT_MODEL.md" },
  { label: "Auth Model", path: "docs/security/AUTH_MODEL.md" },
  { label: "Audit Integrity", path: "docs/security/AUDIT_INTEGRITY.md" },
];

const architectureProofPoints = [
  "Human-in-the-loop approval gate before write-capable agent actions",
  "Server-enforced RBAC with local, JWT, and OIDC/JWKS identity paths",
  "Model gateway readiness across deterministic local, OpenAI Agents SDK, and Bedrock GovCloud routes",
  "Cost, token, and latency guardrails for controlled live-model pilots",
  "Retrieval readiness across local TF-IDF, OpenAI embeddings, and pgvector paths",
  "Policy-as-code checks for runtime gates and GovCloud infrastructure",
  "Policy intelligence source registry with provenance, review queue, and no-auto-enforcement controls",
  "OPA/Rego compatibility export for enterprise policy library review",
  "Tamper-evident approval ledger, evidence manifest, and audit bundle",
  "Local TF-IDF retrieval with scored citations and drift-aware eval coverage",
  "Runtime SLOs plus permission-gated email, Slack, and SIEM alert simulation",
  "Live delivery readiness for approved SMTP, Slack, webhook, and SIEM routes",
];

const resumeBullets = [
  "Built SentinelOps AI, a governed agentic AI control plane for regulated enterprise pilots with React, Node, RBAC, model gateway readiness, cost/token/latency guardrails, scalable retrieval readiness, policy-as-code, OPA/Rego compatibility export, eval gates, audit integrity, retrieval citations, observability, signed alert dispatch, and live delivery readiness.",
  "Mapped a local proof-of-work to a GovCloud-ready deployment pattern using private ECS Fargate, internal ALB, VPC endpoints, encrypted evidence storage, and DynamoDB approval-ledger targets.",
  "Implemented verification scripts for auth, OIDC/JWKS, RBAC, policy, audit integrity, retrieval, observability, alert routing, deployment artifacts, and portfolio readiness.",
];

const interviewTalkTrack = [
  "Start with the business risk: agentic systems need governed tool access, traceable approvals, eval gates, and audit evidence before controlled pilots.",
  "Show the run timeline and approval gate, then switch roles to prove permissions are enforced at the API boundary.",
  "Open Gateway, Retrieval, Controls, Evidence, Observability, and Case Study to connect model routing, retrieval scaling, budget guardrails, Rego compatibility, alert delivery readiness, and audit evidence to employer-facing proof.",
  "Close with GovCloud deployment readiness, remaining live-credential steps, and how the pattern fits cleared enterprise environments.",
];

const publicCaseStudyMetrics = [
  { label: "Deployment assertions", value: "400+", detail: "Checked by npm run deployment:check" },
  { label: "Portfolio artifacts", value: "29", detail: "Verified text, screenshot, video, audit, and launch-readiness deliverables" },
  { label: "Readiness domains", value: "12", detail: "Auth, policy, source intel, gateway, retrieval, audit, evals, observability, delivery, deploy, UX, IP" },
  { label: "Runtime mode", value: "Local", detail: "Deterministic proof without live credentials" },
];

const publicCaseStudyScreenshots = [
  {
    title: "Employer-Facing Case Study",
    image: "/portfolio-assets/sentinelops-dashboard-case-study.png?v=0.22.0",
    detail: "Architecture proof, resume bullets, verification pack, and truth boundary.",
  },
  {
    title: "Model Gateway and Cost Controls",
    image: "/portfolio-assets/sentinelops-dashboard-model-gateway.png?v=0.22.0",
    detail: "Provider routing, deterministic fallback, and live-model readiness behind the API boundary.",
  },
  {
    title: "Retrieval Scale Readiness",
    image: "/portfolio-assets/sentinelops-dashboard-retrieval-readiness.png?v=0.22.0",
    detail: "Local TF-IDF, embeddings, and pgvector paths with probe citations and credential gates.",
  },
  {
    title: "Live Delivery Readiness",
    image: "/portfolio-assets/sentinelops-dashboard-live-delivery-readiness.png?v=0.22.0",
    detail: "SMTP, Slack, webhook, and SIEM readiness with approval gates and secret non-disclosure.",
  },
];

const publicCaseStudyProof = [
  "Server-enforced reviewer roles across local, JWT, and OIDC/JWKS identity modes.",
  "Human approval gates, policy-as-code, OPA/Rego compatibility, and red-team evals before controlled pilots.",
  "Tamper-evident approval ledger, full audit export, evidence manifest hashes, and retention guidance.",
  "GovCloud-oriented deployment skeleton with private networking, VPC endpoints, encrypted storage, and DynamoDB ledger targets.",
];

const demoVideoStats = [
  { label: "Target length", value: "4:30", detail: "Structured for recruiter and technical-screen review" },
  { label: "Scenes", value: "6", detail: "Each scene maps to a verified UI or screenshot artifact" },
  { label: "Proof gates", value: "15", detail: "Build, smoke, portfolio, deployment, and case-study checks" },
  { label: "Claim boundary", value: "Truthful", detail: "No live production, customer, classified, or agency approval claims" },
];

const demoVideoScenes = [
  {
    time: "00:00",
    duration: "25 sec",
    title: "Position the business risk",
    route: "/case-study",
    image: "/portfolio-assets/sentinelops-public-case-study-page.png?v=0.22.0",
    narration: "GovernPilot is a governed control plane for moving agentic AI from prototype to controlled pilot.",
    proof: "The public case-study page gives employers the high-level signal before the dashboard walkthrough.",
  },
  {
    time: "00:25",
    duration: "45 sec",
    title: "Show approval before write-capable tools",
    route: "/",
    image: "/portfolio-assets/sentinelops-dashboard-render.png?v=0.22.0",
    narration: "The run timeline, approval gate, risk matrix, eval health, and evidence rail show the operating workflow.",
    proof: "Reviewer decisions are persisted, signed, and tied to policy checks before evidence export.",
  },
  {
    time: "01:10",
    duration: "45 sec",
    title: "Prove model gateway and budget controls",
    route: "/",
    image: "/portfolio-assets/sentinelops-dashboard-model-gateway.png?v=0.22.0",
    narration: "Provider routing stays server-side with deterministic fallback, OpenAI readiness, and Bedrock GovCloud planning.",
    proof: "Cost, token, p95 latency, and live-budget gates are checked before any live-model pilot claim.",
  },
  {
    time: "01:55",
    duration: "45 sec",
    title: "Connect retrieval to governed evidence",
    route: "/",
    image: "/portfolio-assets/sentinelops-dashboard-retrieval-readiness.png?v=0.22.0",
    narration: "Local TF-IDF, embedding, and pgvector paths are shown with provenance, probe citations, and migration SQL.",
    proof: "Retrieval readiness fails closed when vector credentials or approved corpus boundaries are missing.",
  },
  {
    time: "02:40",
    duration: "45 sec",
    title: "Show observability and delivery readiness",
    route: "/",
    image: "/portfolio-assets/sentinelops-dashboard-live-delivery-readiness.png?v=0.22.0",
    narration: "Runtime SLOs, signed alert routing, and live delivery readiness make operations reviewable.",
    proof: "SMTP, Slack, webhook, and SIEM paths are approval-gated and never disclose credential values.",
  },
  {
    time: "03:25",
    duration: "65 sec",
    title: "Close with employer-facing proof",
    route: "/case-study",
    image: "/portfolio-assets/sentinelops-dashboard-case-study.png?v=0.22.0",
    narration: "The case-study tab translates the working system into resume bullets, a verification pack, and a truth boundary.",
    proof: "The final takeaway is implemented architecture: identity, policy, evals, audit, retrieval, observability, and GovCloud readiness.",
  },
];

// ---------------------------------------------------------------------------
// Health sector (GAGS-HEALTH) — HIPAA + FDA governance. Static fallback, mirrors
// the trusted-workforce pattern: governs the healthcare AI DECISION and stores no
// live PHI. Grounded in docs/standard/GAGS_HEALTH_PROFILE.md and
// standard/health-crosswalk.json. Every regulatory line carries a status tag:
//   in-force = current binding law; proposed = 2025 NPRM, not yet law;
//   future = enacted/finalized but effective date not yet reached (not current obligation);
//   source-identified = official source named, requirement detail pending (roadmap);
//   framework-voluntary = verified consensus framework guidance, NOT binding law.
// Not legal advice.
// ---------------------------------------------------------------------------
type HealthRegStatus = "in-force" | "proposed" | "future" | "source-identified" | "framework-voluntary";

const healthStatusLabels: Record<HealthRegStatus, string> = {
  "in-force": "In force",
  proposed: "Proposed — not yet law",
  future: "Future — not yet in force",
  "source-identified": "Source identified — detail pending",
  "framework-voluntary": "Framework — voluntary, not law",
};

const healthStatusPillClass: Record<HealthRegStatus, string> = {
  "in-force": "is-pass",
  proposed: "is-wait",
  future: "is-wait",
  "source-identified": "is-info",
  "framework-voluntary": "is-info",
};

type HealthSegment = {
  id: string;
  label: string;
  buyers: string;
  applicableRegimes: string[];
};

type HealthControl = {
  id: string;
  status: HealthRegStatus;
  control: string;
  plain: string;
  citation: string;
  met: boolean | null;
};

type HealthFdaCriterion = {
  id: string;
  question: string;
  expert: string;
  met: boolean;
};

type HealthOverlay = {
  id: string;
  status: HealthRegStatus;
  regime: string;
  effectiveDate: string;
  plain: string;
  citation: string;
};

type HealthEval = {
  id: string;
  label: string;
  plain: string;
  passed: boolean;
};

type HealthSectorReadiness = {
  readinessVersion: string;
  generatedAt: string;
  status: string;
  mode: string;
  boundaryLine: string;
  recommendedInitialScope: string;
  businessAssociate: { isBusinessAssociate: boolean; citation: string; status: HealthRegStatus; plain: string };
  segments: HealthSegment[];
  selectedSegmentId: string;
  fdaRouting: {
    track: "non-device-cds" | "fda-device";
    isDevice: boolean;
    basis: string;
    status: HealthRegStatus;
    plain: string;
    criteria: HealthFdaCriterion[];
    deviceTrackControls: { id: string; status: HealthRegStatus; control: string; citation: string }[];
  };
  deidentification: {
    status: HealthRegStatus;
    citation: string;
    plain: string;
    selectedMethod: "safe-harbor" | "expert-determination";
    methods: { id: "safe-harbor" | "expert-determination"; label: string; requirement: string; citation: string }[];
  };
  hipaaControls: HealthControl[];
  proposedControls: HealthControl[];
  overlays: HealthOverlay[];
  evals: HealthEval[];
  humanDecisionBoundary: string[];
  evidencePacket: {
    id: string;
    scope: string;
    generatedAt: string;
    ownerBoundary: string;
    mappedRequirements: { id: string; status: HealthRegStatus; mapping: string }[];
    evidenceSha256: string;
  };
};

const trustedWorkforceFallback: TrustedWorkforceReadiness = {
  service: "sentinelops-api",
  version: "0.22.0",
  generatedAt: "2026-06-18T00:00:00.000Z",
  readinessVersion: "governpilot-trusted-workforce-readiness/v1",
  status: "synthetic-ready",
  mode: "synthetic-readiness",
  authMode: "static-public",
  agentMode: "deterministic-local",
  storageMode: "static-public",
  autoAdjudication: false,
  liveNbisIntegration: {
    requested: false,
    authorized: false,
    accountBoundaryApproved: false,
    ownerConfigured: false,
    owner: "customer-owner-required",
    boundary:
      "No NBIS scraping, credential reuse, browser automation, or eApp submission is allowed without formal customer authorization and security review.",
  },
  counts: {
    sources: 3,
    authoritativeSources: 3,
    lifecycleStages: 4,
    procedures: 3,
    workInstructions: 3,
    blockedDataCategories: 5,
    passingControls: 4,
    totalControls: 4,
  },
  sources: [
    {
      id: "performance-trusted-workforce-2",
      label: "Trusted Workforce 2.0",
      authority: "Performance.gov",
      category: "personnel-vetting-policy",
      officialUrl: "https://www.performance.gov/trusted-workforce/",
      updateCadence: "quarterly-progress-watch",
      ownerRole: "compliance-analyst",
      approvalRequirement: "FSO, SSO, or personnel security owner approves applicability before workflow activation.",
      mappedConcepts: ["personnel vetting", "risk and sensitivity", "continuous vetting"],
      status: "official-source-registered",
      trustLevel: "authoritative-public",
      provenance: {
        sourceUrlRecorded: true,
        contentHashAlgorithm: "sha256",
        snapshotHash: "6f6c847a2a6d5cdb7dd25283b8af1f02f8070d35cb1410a7f3c4f1d9f98c2a10",
        lastCheckedAt: "2026-06-18T00:00:00.000Z",
        evidenceRequired: ["source URL", "retrieval timestamp", "content hash", "reviewer approval", "effective date"],
      },
    },
    {
      id: "personnel-vetting-basics-fact-sheet",
      label: "Personnel Vetting Basics Fact Sheet",
      authority: "Performance.gov",
      category: "personnel-vetting-process",
      officialUrl: "https://assets.performance.gov/files/PV_Basics_Fact_Sheet.pdf",
      updateCadence: "source-release-watch",
      ownerRole: "compliance-analyst",
      approvalRequirement: "Personnel security owner approves lifecycle mapping and evidence requirements.",
      mappedConcepts: ["position designation", "forms completion", "background investigation", "continuous vetting"],
      status: "official-source-registered",
      trustLevel: "authoritative-public",
      provenance: {
        sourceUrlRecorded: true,
        contentHashAlgorithm: "sha256",
        snapshotHash: "f1c9ef163f27ab8fd4f3d81a35d1be8407b845f8cbda40b25f68e1e7d4792e70",
        lastCheckedAt: "2026-06-18T00:00:00.000Z",
        evidenceRequired: ["source URL", "retrieval timestamp", "content hash", "reviewer approval", "effective date"],
      },
    },
    {
      id: "dcsa-nbis-agency-eapp",
      label: "DCSA NBIS Agency and eApp",
      authority: "DCSA",
      category: "system-guidance",
      officialUrl:
        "https://www.dcsa.mil/Systems-Applications/National-Background-Investigation-Services-NBIS/NBIS-eApp-NBIS-Agency/",
      updateCadence: "official-page-watch",
      ownerRole: "security-reviewer",
      approvalRequirement: "FSO/SSO validates NBIS workflow boundaries and confirms no live automation is enabled.",
      mappedConcepts: ["eApp", "NBIS Agency", "FSO", "SSO", "continuous vetting"],
      status: "official-source-registered",
      trustLevel: "authoritative-public",
      provenance: {
        sourceUrlRecorded: true,
        contentHashAlgorithm: "sha256",
        snapshotHash: "d3cd3a123a91a6a75fb767e7b55883396830344c8dfefb7ef97001d21ff7bdf1",
        lastCheckedAt: "2026-06-18T00:00:00.000Z",
        evidenceRequired: ["source URL", "retrieval timestamp", "content hash", "reviewer approval", "effective date"],
      },
    },
  ],
  lifecycle: [
    {
      id: "position",
      label: "Position",
      title: "Position Designation",
      ownerRole: "HR security owner",
      status: "ready",
      policySourceIds: ["performance-trusted-workforce-2", "personnel-vetting-basics-fact-sheet"],
      requiredEvidence: ["risk level", "sensitivity level", "source citation"],
      aiBoundary: "AI may summarize designation factors; a human owner confirms the designation.",
    },
    {
      id: "initiation",
      label: "Initiation",
      title: "Forms, Fingerprints, and eApp Readiness",
      ownerRole: "FSO/SSO",
      status: "review-required",
      policySourceIds: ["dcsa-nbis-agency-eapp"],
      requiredEvidence: ["FSO/SSO review note", "training status", "data-boundary attestation"],
      aiBoundary: "AI may produce a checklist; it must not submit NBIS/eApp actions.",
    },
    {
      id: "adjudication",
      label: "Adjudication",
      title: "Trust Determination Handoff",
      ownerRole: "authorized adjudication owner",
      status: "human-only",
      policySourceIds: ["personnel-vetting-basics-fact-sheet"],
      requiredEvidence: ["handoff status", "authorized owner", "eligibility/access separation note"],
      aiBoundary: "AI may track handoff state; it must never make or imply a trust determination.",
    },
    {
      id: "continuous-vetting",
      label: "Continuous Vetting",
      title: "Continuous Vetting and Self-Reporting Triage",
      ownerRole: "FSO/SSO",
      status: "review-required",
      policySourceIds: ["performance-trusted-workforce-2", "dcsa-nbis-agency-eapp"],
      requiredEvidence: ["triage category", "routing owner", "non-sensitive summary"],
      aiBoundary: "AI may triage category and routing; it must never auto-adjudicate.",
    },
  ],
  procedures: [
    {
      id: "procedure-position-designation",
      title: "Validate position designation before vetting initiation",
      processStageId: "position",
      ownerRole: "HR security owner",
      status: "ready",
      policySourceIds: ["performance-trusted-workforce-2"],
      requiredEvidence: ["risk category", "sensitivity category", "reviewer name", "source citation"],
      blockedDataCategories: ["SSN", "date of birth", "classified data", "CUI"],
      workInstructionIds: ["wi-position-risk", "wi-source-citation"],
    },
    {
      id: "procedure-initiation-readiness",
      title: "Confirm eApp/NBIS initiation readiness",
      processStageId: "initiation",
      ownerRole: "FSO/SSO",
      status: "review-required",
      policySourceIds: ["dcsa-nbis-agency-eapp"],
      requiredEvidence: ["FSO/SSO review note", "training check", "PII exclusion check", "account readiness"],
      blockedDataCategories: ["SSN", "fingerprints or biometric templates", "live NBIS credentials"],
      workInstructionIds: ["wi-training-check", "wi-pii-exclusion"],
    },
    {
      id: "procedure-continuous-vetting-triage",
      title: "Triage continuous vetting or self-reporting events without auto-adjudication",
      processStageId: "continuous-vetting",
      ownerRole: "FSO/SSO",
      status: "review-required",
      policySourceIds: ["performance-trusted-workforce-2", "dcsa-nbis-agency-eapp"],
      requiredEvidence: ["triage category", "routing owner", "review note", "no-auto-adjudication attestation"],
      blockedDataCategories: ["foreign contact details", "financial account details", "adjudicative concern details"],
      workInstructionIds: ["wi-cv-routing", "wi-human-decision"],
    },
  ],
  workInstructions: [
    {
      id: "wi-position-risk",
      procedureId: "procedure-position-designation",
      title: "Capture risk and sensitivity categories",
      ownerRole: "HR security owner",
      instruction: "Record only the category labels needed for readiness.",
      evidenceRequired: ["risk category", "sensitivity category", "reviewer note"],
      forbiddenInputs: ["classified mission details", "CUI program details"],
      completionGate: "security-reviewer approval",
    },
    {
      id: "wi-pii-exclusion",
      procedureId: "procedure-initiation-readiness",
      title: "Verify no applicant PII enters GovernPilot",
      ownerRole: "security manager",
      instruction: "Use aliases and status categories only. Keep applicant questionnaire content in authorized systems.",
      evidenceRequired: ["data-boundary attestation", "blocked category list"],
      forbiddenInputs: ["SSN", "date of birth", "fingerprints or biometric templates", "live NBIS credentials"],
      completionGate: "data-boundary pass",
    },
    {
      id: "wi-human-decision",
      procedureId: "procedure-continuous-vetting-triage",
      title: "Prevent automated trust decisions",
      ownerRole: "security reviewer",
      instruction: "Confirm AI only suggests routing and evidence gaps. It must not approve, deny, or imply a trust determination.",
      evidenceRequired: ["no-auto-adjudication attestation", "reviewer note"],
      forbiddenInputs: ["adjudicative decision text", "trust determination rationale"],
      completionGate: "security-reviewer approval",
    },
  ],
  controls: [
    {
      id: "TW-POSDES-001",
      label: "Position designation evidence exists before initiation readiness.",
      passed: true,
      severity: "critical",
      evidence: "Position stage requires risk, sensitivity, reviewer, and source citation.",
    },
    {
      id: "TW-DATA-003",
      label: "Personnel-vetting sensitive data is blocked from the public/demo workflow.",
      passed: true,
      severity: "critical",
      evidence: "Workflow excludes SSN, biometrics, adjudicative details, classified data, CUI, and NBIS credentials.",
    },
    {
      id: "TW-CV-006",
      label: "Continuous vetting is triaged but never auto-adjudicated.",
      passed: true,
      severity: "critical",
      evidence: "AI can route review categories only; trust decisions remain human-only.",
    },
    {
      id: "TW-NBIS-008",
      label: "Live NBIS integration remains disabled unless authorization and account boundaries are approved.",
      passed: true,
      severity: "critical",
      evidence: "Static/public mode uses launch-out/reference posture only.",
    },
  ],
  dataBoundary: [
    "Use synthetic or customer-approved non-sensitive metadata only.",
    "Do not store SSNs, DOBs, addresses, fingerprints, foreign contacts, adjudicative details, classified data, CUI, or NBIS credentials.",
    "NBIS and eApp remain authoritative systems; GovernPilot is a readiness/evidence layer in the first build.",
  ],
  humanDecisionBoundary: [
    "Position designation is confirmed by the responsible HR/security owner.",
    "Initiation readiness is approved by an FSO/SSO or security manager.",
    "Trust determination and access decisions are external human decisions.",
    "Continuous vetting events are routed for review and never auto-adjudicated.",
  ],
  evidencePacket: {
    id: "trusted-workforce-readiness-evidence",
    generatedAt: "2026-06-18T00:00:00.000Z",
    scope: "synthetic-readiness-demo",
    ownerBoundary: "FSO/SSO/security manager keeps source systems authoritative.",
    sourceCount: 3,
    lifecycleStageCount: 4,
    procedureCount: 3,
    workInstructionCount: 3,
    blockedDataCategories: ["SSN", "DOB", "fingerprints", "adjudicative details", "NBIS credentials"],
    controls: [
      { id: "TW-POSDES-001", passed: true, evidence: "Position designation required." },
      { id: "TW-DATA-003", passed: true, evidence: "Sensitive personnel-vetting fields blocked." },
    ],
    evidenceSha256: "2d59ff506e8fc86474701ea47d376f0a547d41b15f6361c5e9a3018207c18e51",
  },
  evidenceMarkdown: "# Trusted Workforce Readiness Evidence\n\nStatic public fallback evidence.",
  implementationPlan: [
    "Add Trusted Workforce and NBIS source registry records with provenance hashes.",
    "Model position, candidate, initiation, investigation, adjudication, access, continuous vetting, and evidence lifecycle stages.",
    "Attach procedure templates and one-page work instructions to each stage.",
    "Run policy-as-code checks for source citation, role approval, data boundary, and no-auto-adjudication.",
  ],
};

// Static health-sector fallback. Always present so the Health view renders with no
// backend. Grounded in the verified GAGS-HEALTH facts; statuses are never upgraded
// (a proposed NPRM control is never shown as current law).
const healthSectorFallback: HealthSectorReadiness = {
  readinessVersion: "governpilot-health-governance-readiness/v1",
  generatedAt: "2026-06-19T00:00:00.000Z",
  status: "synthetic-ready",
  mode: "synthetic-readiness",
  boundaryLine:
    "Informational only, not legal advice. GovernPilot governs the healthcare AI decision and stores no live PHI.",
  recommendedInitialScope:
    "Govern administrative/operational PHI AI first (documentation, scheduling, coding, prior-auth). The FDA four-criterion router flags when a use case crosses into clinical/device territory.",
  businessAssociate: {
    isBusinessAssociate: true,
    citation: "45 CFR 164.306(a)",
    status: "in-force",
    plain:
      "When GovernPilot touches electronic protected health information (ePHI), it acts as a HIPAA Business Associate and its PHI handling is governed accordingly.",
  },
  segments: [
    {
      id: "government-health",
      label: "Government health",
      buyers: "VA · CMS · MHS · NIH",
      applicableRegimes: ["HIPAA (in force)", "FedRAMP/OMB (via core)", "CMS prior-auth (in force)"],
    },
    {
      id: "provider",
      label: "Hospitals & health systems",
      buyers: "Providers · IDNs",
      applicableRegimes: ["HIPAA (in force)", "ONC HTI-1 predictive DSI (in force)"],
    },
    {
      id: "samd-vendor",
      label: "Health-tech / SaMD vendors",
      buyers: "Medical-AI vendors",
      applicableRegimes: ["FDA device track if routed (in force)", "GMLP / PCCP (in force)", "HIPAA as BA (in force)"],
    },
    {
      id: "payer-administrative",
      label: "Payers / administrative",
      buyers: "Health plans · TPAs",
      applicableRegimes: ["HIPAA (in force)", "CMS-0057-F prior-auth (in force)", "state AI law (CA in force; CO future)"],
    },
  ],
  selectedSegmentId: "payer-administrative",
  fdaRouting: {
    track: "non-device-cds",
    isDevice: false,
    basis: "FD&C Act 520(o)(1)(E) — four conjunctive Non-Device CDS criteria",
    status: "in-force",
    plain:
      "All four Non-Device CDS criteria are met for this administrative example, so it stays on the administrative (non-device) track. If any one criterion failed, the use case would be an FDA-regulated device and the device track would apply.",
    criteria: [
      {
        id: "notSignalOrImage",
        question: "Does the AI avoid processing a medical image, signal, or in-vitro diagnostic?",
        expert: "Not a signal/image acquirer or processor",
        met: true,
      },
      {
        id: "displaysMedicalInfo",
        question: "Does it only display or analyze medical information about a patient?",
        expert: "Displays/analyzes medical information",
        met: true,
      },
      {
        id: "recommendationsOnly",
        question: "Does it give recommendations rather than a specific directive output?",
        expert: "Recommendations, not a specific directive",
        met: true,
      },
      {
        id: "independentReview",
        question: "Can a clinician independently review the basis for the recommendation?",
        expert: "Healthcare professional can independently review the basis",
        met: true,
      },
    ],
    deviceTrackControls: [
      { id: "HX-D1", status: "in-force", control: "GMLP alignment (10 guiding principles)", citation: "FDA/Health Canada/MHRA, Oct 2021" },
      { id: "HX-D2", status: "in-force", control: "PCCP governs planned model changes", citation: "Finalized Dec 4, 2024" },
      { id: "HX-D3", status: "source-identified", control: "Postmarket performance + bias/health-equity monitoring", citation: "FDA Jan 6 2025 lifecycle guidance (DRAFT — non-binding)" },
    ],
  },
  deidentification: {
    status: "in-force",
    citation: "45 CFR 164.514(b)",
    plain:
      "If data is treated as de-identified, exactly one of two lawful methods must be used and its evidence captured. A Limited Data Set is not a third method.",
    selectedMethod: "safe-harbor",
    methods: [
      {
        id: "safe-harbor",
        label: "Safe Harbor",
        requirement:
          "Remove the 18 HIPAA identifier categories (including the catch-all) and have no actual knowledge the result could re-identify the individual.",
        citation: "45 CFR 164.514(b)(2)",
      },
      {
        id: "expert-determination",
        label: "Expert Determination",
        requirement:
          "A qualified expert documents the methods and results showing a very small re-identification risk; the documentation is retained for OCR on request.",
        citation: "45 CFR 164.514(b)(1)",
      },
    ],
  },
  hipaaControls: [
    {
      id: "HX-1",
      status: "in-force",
      control: "Business-associate posture declared",
      plain: "GovernPilot states it acts as a HIPAA Business Associate when it touches ePHI.",
      citation: "45 CFR 164.306(a)",
      met: true,
    },
    {
      id: "HX-2",
      status: "in-force",
      control: "Unique user identification on PHI actions",
      plain: "Every AI action that affects PHI is tied to one named user — Unique User ID is Required.",
      citation: "45 CFR 164.312(a)(2)(i)",
      met: true,
    },
    {
      id: "HX-3",
      status: "in-force",
      control: "Emergency (break-glass) access recorded",
      plain: "An emergency access path exists and is itself logged — Emergency Access is Required.",
      citation: "45 CFR 164.312(a)(2)(ii)",
      met: true,
    },
    {
      id: "HX-4",
      status: "in-force",
      control: "Automatic logoff (addressable)",
      plain: "Sessions can auto-log-off; this safeguard is Addressable, not strictly required.",
      citation: "45 CFR 164.312(a)(2)(iii)",
      met: true,
    },
    {
      id: "HX-5",
      status: "in-force",
      control: "Audit controls over PHI activity",
      plain: "AI activity on systems with PHI is recorded and can be examined.",
      citation: "45 CFR 164.312(b)",
      met: true,
    },
    {
      id: "HX-6",
      status: "in-force",
      control: "Integrity via hash-chained ledger",
      plain: "A tamper-evident, hash-chained ledger corroborates that PHI-affecting records were not improperly altered.",
      citation: "45 CFR 164.312(c)",
      met: true,
    },
    {
      id: "HX-7",
      status: "in-force",
      control: "De-identification via one of two lawful methods",
      plain: "If data is de-identified, exactly Safe Harbor or Expert Determination is enforced and its evidence captured.",
      citation: "45 CFR 164.514(b)",
      met: true,
    },
  ],
  proposedControls: [
    {
      id: "HX-9",
      status: "proposed",
      control: "Encryption of ePHI at rest and in transit",
      plain: "The 2025 HIPAA Security Rule NPRM would make encryption mandatory. Proposed only — implemented as forward-looking.",
      citation: "HIPAA Security Rule NPRM, Jan 6 2025",
      met: null,
    },
    {
      id: "HX-10",
      status: "proposed",
      control: "Multi-factor authentication",
      plain: "The 2025 NPRM would require MFA. Proposed only — not yet law.",
      citation: "HIPAA Security Rule NPRM, Jan 6 2025",
      met: null,
    },
    {
      id: "HX-11",
      status: "proposed",
      control: "Technology asset inventory + ePHI data-flow / network map",
      plain: "The 2025 NPRM would require an asset inventory and data-flow map, reviewed at least every 12 months. Proposed only.",
      citation: "HIPAA Security Rule NPRM, Jan 6 2025",
      met: null,
    },
  ],
  overlays: [
    {
      id: "HX-12",
      status: "in-force",
      regime: "ONC HTI-1 predictive DSI transparency",
      effectiveDate: "Effective 2025-01-01",
      plain: "AI clinical decision-support tools must publish 31 transparency attributes and risk-management analysis.",
      citation: "45 CFR 170.315(b)(11)",
    },
    {
      id: "HX-13",
      status: "in-force",
      regime: "CMS prior authorization + Medicare Advantage AI",
      effectiveDate: "Effective 2026-01-01",
      plain: "Denials need a specific reason within set timeframes, and an algorithm alone cannot deny care — a person must weigh the individual patient.",
      citation: "CMS-0057-F (89 FR 8758); 42 CFR 422.101(c). Prior Authorization API future (2027-01-01).",
    },
    {
      id: "HX-14",
      status: "in-force",
      regime: "42 CFR Part 2 (substance-use records)",
      effectiveDate: "Effective 2026-02-16",
      plain: "Substance-use-disorder records need patient consent, a disclosure notice, and can't be used in proceedings without separate consent.",
      citation: "42 CFR Part 2 (2024 final rule)",
    },
    {
      id: "HX-17a",
      status: "in-force",
      regime: "California AB 3030 / SB 1120",
      effectiveDate: "Effective 2025-01-01",
      plain: "Patients must be told when a message is AI-generated; medical-necessity decisions must be made by a licensed professional, not AI.",
      citation: "California AB 3030; California SB 1120",
    },
    {
      id: "HX-17b",
      status: "future",
      regime: "Colorado AI Act (SB24-205)",
      effectiveDate: "Effective 2026-06-30",
      plain: "High-risk AI duties: impact assessments, consumer notice, and appeal rights (delayed from Feb 2026).",
      citation: "Colorado AI Act SB24-205",
    },
    {
      id: "HX-18",
      status: "future",
      regime: "EU AI Act high-risk medical AI",
      effectiveDate: "Effective 2026-08-02 (Annex III) / 2027-08-02 (medical devices)",
      plain: "EU high-risk obligations: risk management, logging, human oversight, post-market monitoring.",
      citation: "EU AI Act (Annex III high-risk; medical-device classification)",
    },
    {
      id: "HX-15",
      status: "framework-voluntary",
      regime: "NIST 800-66r2 / AI RMF / AI 600-1",
      effectiveDate: "Voluntary guidance (no effective date)",
      plain: "Evidences HIPAA via NIST: 800-66r2 HIPAA→CSF/800-53 mapping, AI RMF 4 functions, and AI 600-1's 12 GAI risks (health: data privacy, confabulation, bias). Voluntary — does not guarantee compliance.",
      citation: "NIST SP 800-66 Rev.2; NIST AI RMF 1.0; NIST AI 600-1",
    },
    {
      id: "HX-16",
      status: "framework-voluntary",
      regime: "CHAI Applied Model Card",
      effectiveDate: "Voluntary (Draft V0.1, Nov 2024)",
      plain: "Model-card completeness over the 9-section CHAI schema (incl. Key Metrics: usefulness, fairness, safety). Supports — does not legally satisfy — ONC HTI-1 transparency.",
      citation: "CHAI Applied Model Card schema.xsd (Draft V0.1)",
    },
  ],
  evals: [
    {
      id: "phi-leakage-redteam",
      label: "PHI-leakage red-team",
      plain: "Tries to make the AI emit identifiers that would fail the Safe Harbor scrub; the run is blocked if it leaks.",
      passed: true,
    },
    {
      id: "deid-scrub",
      label: "De-identification scrub check",
      plain: "Confirms structured identifiers are removed; names, photos, and biometrics are flagged for human review.",
      passed: true,
    },
    {
      id: "health-equity-bias",
      label: "Health-equity / bias eval",
      plain: "Checks subgroup performance. Aligns with the FDA draft lifecycle guidance and state non-discrimination overlays.",
      passed: true,
    },
  ],
  humanDecisionBoundary: [
    "GovernPilot governs the healthcare AI deployment decision; it stores and returns no live PHI.",
    "Clinical and trust decisions remain with authorized humans; the AI prepares evidence and recommendations only.",
    "The FDA device-track determination is recorded as evidence, not asserted as an FDA clearance.",
    "Proposed NPRM controls are configured as forward-looking and are never presented as current legal obligations.",
  ],
  evidencePacket: {
    id: "health-sector-readiness-evidence",
    scope: "synthetic-readiness-demo",
    generatedAt: "2026-06-19T00:00:00.000Z",
    ownerBoundary: "Covered entity / business-associate owner keeps source health systems authoritative.",
    mappedRequirements: [
      { id: "HX-1..HX-7", status: "in-force", mapping: "HIPAA access, audit, integrity, and de-identification controls (in force)." },
      { id: "HX-8", status: "in-force", mapping: "FDA Non-Device CDS routing determination (in force)." },
      { id: "HX-9..HX-11", status: "proposed", mapping: "2025 NPRM encryption, MFA, asset inventory (proposed — not law)." },
      { id: "HX-12, HX-13, HX-14, HX-17a", status: "in-force", mapping: "In-force overlays: ONC HTI-1 DSI, CMS prior authorization, 42 CFR Part 2, California AB 3030 / SB 1120 (in force)." },
      { id: "HX-17b, HX-18", status: "future", mapping: "Future overlays: Colorado AI Act, EU AI Act high-risk (enacted — effective date not yet reached)." },
      { id: "HX-15, HX-16", status: "source-identified", mapping: "Overlay regimes: NIST 800-66r2 / AI RMF / AI 600-1, CHAI assurance (source identified — detail pending)." },
    ],
    evidenceSha256: "9b7e4c1f0a2d6e8b3c5a7f9d1e2b4c6a8d0f2e4b6c8a0d2f4e6b8c0a2d4f6e8b",
  },
};

const partnerBriefSlides = [
  {
    eyebrow: "Overview",
    title: "What the app does",
    body:
      "GovernPilot helps teams test AI workflows with approval gates, policy tracking, evidence capture, audit logs, and clear data boundaries.",
    points: [
      "Shows who approved an AI-assisted action.",
      "Shows which policy source supports the action.",
      "Captures evidence for review.",
      "Shows what still needs human review before real use.",
    ],
  },
  {
    eyebrow: "Why it matters",
    title: "AI needs controls before it touches sensitive work.",
    body:
      "Government and contracting environments cannot rely on a chatbot answer alone. They need proof, approvals, policy authority, and auditability.",
    points: [
      "Security teams need to know what happened.",
      "Policy teams need to know what source was used.",
      "Program teams need evidence they can show later.",
      "Leadership needs a safer path from demo to pilot.",
    ],
  },
  {
    eyebrow: "Trust model",
    title: "It is not AI blindly auditing AI.",
    body:
      "The product is meant to make AI governance reviewable by humans. The customer can inspect the policy source, approval trail, evidence packet, and blocked data categories.",
    points: [
      "Important decisions stay human-approved.",
      "Policy sources are visible.",
      "Evidence can be exported.",
      "New policy interpretations are not auto-enforced.",
    ],
  },
  {
    eyebrow: "Current status",
    title: "This is a working proof-of-concept.",
    body:
      "The current app is a demo and pilot-readiness proof. It is not yet a FedRAMP-authorized, CMMC-certified, agency-approved, or production-accredited system.",
    points: [
      "First tests should use public, synthetic, or approved non-sensitive data only.",
      "No classified, CUI, PHI, PII, or customer-sensitive data in first tests.",
      "Customer security and policy owners keep final authority.",
    ],
  },
];

const defaultActor: ReviewerActor = {
  name: "Grant Burley III",
  role: "security-reviewer",
};

const fallbackReviewerPermissions: RbacPermission[] = [
  "create_run",
  "approve_gate",
  "deny_gate",
  "run_evals",
  "run_agent_review",
  "export_evidence",
  "route_alerts",
  "view_settings",
];

const permissionLabels: Record<RbacPermission, string> = {
  create_run: "Create assessment runs",
  approve_gate: "Approve action gates",
  deny_gate: "Deny action gates",
  run_evals: "Run eval packs",
  run_agent_review: "Run agent reviews",
  export_evidence: "Export evidence",
  route_alerts: "Route observability alerts",
  view_settings: "View settings",
};

type ExperienceMode = "overview" | "guided" | "advanced";
type GuidedOutcomeId = "ai-governance" | "personnel-vetting" | "health" | "audit-evidence" | "technical-console";
type GuidedStepAction =
  | "advance"
  | "new-run"
  | "approve"
  | "eval"
  | "agent-review"
  | "export-evidence"
  | "audit-export"
  | "advanced";

type GuidedOutcome = {
  id: GuidedOutcomeId;
  label: string;
  summary: string;
  detail: string;
  status: string;
  duration: string;
  target: string;
  actionLabel: string;
  icon: typeof ShieldCheck;
};

type GuidedStep = {
  id: string;
  label: string;
  title: string;
  body: string;
  owner: string;
  status: string;
  primaryLabel: string;
  action: GuidedStepAction;
  advancedTarget: string;
  checks: string[];
};

function getInitialNav() {
  if (typeof window === "undefined") return "Command Center";
  const requested = new URLSearchParams(window.location.search).get("tab");
  const normalized = requested ? navAliases[requested] || requested : null;
  if (normalized && [...allTabs, proofNavItem.label].includes(normalized)) {
    return normalized;
  }
  return "Command Center";
}

function getInitialExperienceMode(): ExperienceMode {
  if (typeof window === "undefined") return "overview";
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "advanced" || params.has("tab")) return "advanced";
  if (params.get("mode") === "guided") return "guided";
  return "overview";
}

export function App() {
  const [sequence, setSequence] = useState(1);
  const [run, setRun] = useState<AssessmentRun>(() => createAssessmentRun(1));
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [policyChecks, setPolicyChecks] = useState<PolicyCheck[]>([]);
  const [agentReviews, setAgentReviews] = useState<AgentReview[]>([]);
  const [activePolicy, setActivePolicy] = useState<ActivePolicy | null>(null);
  const [policyIntelligence, setPolicyIntelligence] = useState<PolicyIntelligenceStatus | null>(null);
  const [evalReport, setEvalReport] = useState<EvalReport | null>(null);
  const [modelGateway, setModelGateway] = useState<ModelGatewayStatus | null>(null);
  const [costGuardrails, setCostGuardrails] = useState<CostGuardrails | null>(null);
  const [regoCompatibility, setRegoCompatibility] = useState<RegoCompatibility | null>(null);
  const [retrievalReadiness, setRetrievalReadiness] = useState<RetrievalReadiness | null>(null);
  const [trustedWorkforce, setTrustedWorkforce] = useState<TrustedWorkforceReadiness | null>(null);
  const [observability, setObservability] = useState<ObservabilitySummary | null>(null);
  const [alertRouting, setAlertRouting] = useState<AlertRoutingStatus | null>(null);
  const [liveDelivery, setLiveDelivery] = useState<LiveDeliveryReadiness | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [storage, setStorage] = useState<ApiRunResponse["storage"] | null>(null);
  const [actor, setActor] = useState<ReviewerActor>(defaultActor);
  const [rbacRoles, setRbacRoles] = useState<RbacRole[]>([]);
  const [query, setQuery] = useState("");
  const [selectedNav, setSelectedNav] = useState(getInitialNav);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>(getInitialExperienceMode);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<GuidedOutcomeId>("ai-governance");
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [apiState, setApiState] = useState({
    mode: "connecting",
    label: "Connecting API",
  });

  function hydrateFromApi(response: ApiRunResponse) {
    // Guard against a host that serves the SPA index.html (HTTP 200) for /api routes:
    // a non-run response must fall back to local, never set `run` to undefined.
    if (!response || typeof response !== "object" || !response.run) {
      markLocalFallback();
      setTrustedWorkforce(trustedWorkforceFallback);
      return;
    }
    setRun(response.run);
    setApprovals(response.approvals);
    setPolicyChecks(response.policyChecks);
    setAgentReviews(response.agentReviews);
    setStorage(response.storage);
    setApiState({ mode: "api", label: "API persistence" });
  }

  function markLocalFallback() {
    setApiState({ mode: "local", label: "Local fallback" });
  }

  async function refreshSupplementalData() {
    const [
      policyResult,
      policyIntelligenceResult,
      evalResult,
      gatewayResult,
      costResult,
      regoResult,
      retrievalResult,
      trustedWorkforceResult,
      systemResult,
      rbacResult,
      observabilityResult,
      alertRoutingResult,
      liveDeliveryResult,
    ] = await Promise.allSettled([
      getActivePolicy(),
      getPolicyIntelligenceStatus(),
      getLatestEvalReport(),
      getModelGatewayStatus(),
      getCostGuardrails(),
      getRegoCompatibility(),
      getRetrievalReadiness(),
      getTrustedWorkforceReadiness(),
      getSystemInfo(),
      getRbacRoles(),
      getObservabilitySummary(),
      getAlertRoutingStatus(),
      getLiveDeliveryReadiness(),
    ]);
    if (policyResult.status === "fulfilled") setActivePolicy(policyResult.value);
    if (policyIntelligenceResult.status === "fulfilled") setPolicyIntelligence(policyIntelligenceResult.value);
    if (evalResult.status === "fulfilled") setEvalReport(evalResult.value);
    if (gatewayResult.status === "fulfilled") setModelGateway(gatewayResult.value);
    if (costResult.status === "fulfilled") setCostGuardrails(costResult.value);
    if (regoResult.status === "fulfilled") setRegoCompatibility(regoResult.value);
    if (retrievalResult.status === "fulfilled") setRetrievalReadiness(retrievalResult.value);
    if (trustedWorkforceResult.status === "fulfilled") setTrustedWorkforce(trustedWorkforceResult.value);
    if (systemResult.status === "fulfilled") setSystemInfo(systemResult.value);
    if (rbacResult.status === "fulfilled") {
      setRbacRoles(rbacResult.value.roles);
      setActor((current) => ({
        name: current.name || rbacResult.value.defaultActor.name,
        role: current.role || rbacResult.value.defaultActor.role,
      }));
    }
    if (observabilityResult.status === "fulfilled") setObservability(observabilityResult.value);
    if (alertRoutingResult.status === "fulfilled") setAlertRouting(alertRoutingResult.value);
    if (liveDeliveryResult.status === "fulfilled") setLiveDelivery(liveDeliveryResult.value);
  }

  useEffect(() => {
    let active = true;
    getLatestRun()
      .then((response) => {
        if (active) {
          hydrateFromApi(response);
          void refreshSupplementalData();
        }
      })
      .catch(() => {
        if (active) {
          markLocalFallback();
          setTrustedWorkforce(trustedWorkforceFallback);
          void refreshSupplementalData();
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredRisks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return run.risks;
    return run.risks.filter((risk) =>
      [risk.label, risk.function, risk.status, risk.evidence].join(" ").toLowerCase().includes(needle),
    );
  }, [query, run.risks]);
  const currentPage = pageMeta[selectedNav] || pageMeta["Command Center"];

  const latestApproval = approvals[0] ?? null;
  const latestPolicyCheck = policyChecks[0] ?? null;
  const latestAgentReview = agentReviews[0] ?? null;
  const passingPolicyChecks = latestPolicyCheck?.checks.filter((check) => check.passed).length ?? 0;
  const currentRole = rbacRoles.find((role) => role.id === actor.role) ?? null;
  const rolePermissions = currentRole?.permissions ?? fallbackReviewerPermissions;
  const canCreateRun = rolePermissions.includes("create_run");
  const canApproveGate = rolePermissions.includes("approve_gate");
  const canDenyGate = rolePermissions.includes("deny_gate");
  const canRunEvals = rolePermissions.includes("run_evals");
  const canRunAgentReview = rolePermissions.includes("run_agent_review");
  const canExportEvidence = rolePermissions.includes("export_evidence");
  const canRouteAlerts = rolePermissions.includes("route_alerts");
  const isPublicCaseStudyRoute = typeof window !== "undefined" && window.location.pathname === "/case-study";
  const isDemoVideoRoute = typeof window !== "undefined" && window.location.pathname === "/demo-video";
  const isPartnerBriefRoute = typeof window !== "undefined" && window.location.pathname === "/partner-brief";

  if (isPublicCaseStudyRoute) {
    return (
      <PublicCaseStudyPage
        agentMode={systemInfo?.agentMode || "deterministic-local"}
        storageMode={storage?.mode || systemInfo?.storageMode || "local-json"}
        version={systemInfo?.version || "0.22.0"}
      />
    );
  }

  if (isDemoVideoRoute) {
    return (
      <DemoVideoStoryboardPage
        agentMode={systemInfo?.agentMode || "deterministic-local"}
        storageMode={storage?.mode || systemInfo?.storageMode || "local-json"}
        version={systemInfo?.version || "0.22.0"}
      />
    );
  }

  if (isPartnerBriefRoute) {
    return <PartnerBriefDeck version={systemInfo?.version || "0.22.0"} />;
  }

  function isForbidden(error: unknown) {
    return typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 403;
  }

  function markRbacDenied() {
    setApiState({ mode: "blocked", label: "RBAC denied" });
  }

  function setActorRole(role: ReviewerRoleId) {
    setActor((current) => ({ ...current, role }));
  }

  async function startAssessment() {
    if (!canCreateRun) {
      markRbacDenied();
      return;
    }
    setBusyAction("new");
    try {
      hydrateFromApi(await createRun());
      void refreshSupplementalData();
    } catch {
      const next = sequence + 1;
      setSequence(next);
      setApprovals([]);
      setPolicyChecks([]);
      setAgentReviews([]);
      setRun(createAssessmentRun(next));
      markLocalFallback();
    } finally {
      setBusyAction(null);
    }
  }

  async function setGate(state: GateState) {
    if ((state === "approved" && !canApproveGate) || (state === "denied" && !canDenyGate)) {
      markRbacDenied();
      return;
    }
    setBusyAction(state);
    try {
      hydrateFromApi(await decideRunGate(run.id, state, actor));
      void refreshSupplementalData();
    } catch (error) {
      if (isForbidden(error)) {
        markRbacDenied();
        return;
      }
      setRun((current) => decideGate(current, state));
      markLocalFallback();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleEvalPack() {
    if (!canRunEvals) {
      markRbacDenied();
      return;
    }
    setBusyAction("eval");
    try {
      hydrateFromApi(await runEvalPack(run.id, actor));
      void refreshSupplementalData();
    } catch (error) {
      if (isForbidden(error)) {
        markRbacDenied();
        return;
      }
      setRun((current) => rerunEvalPack(current));
      markLocalFallback();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAgentReview() {
    if (!canRunAgentReview) {
      markRbacDenied();
      return;
    }
    setBusyAction("agent");
    try {
      hydrateFromApi(await runAgentReview(run.id, actor));
      void refreshSupplementalData();
    } catch (error) {
      if (isForbidden(error)) {
        markRbacDenied();
        return;
      }
      markLocalFallback();
    } finally {
      setBusyAction(null);
    }
  }

  async function exportEvidence() {
    if (!canExportEvidence) {
      markRbacDenied();
      return;
    }
    let packet = "";
    try {
      packet = await exportRunEvidence(run.id, actor);
    } catch (error) {
      if (isForbidden(error)) {
        markRbacDenied();
        return;
      }
      packet = buildEvidencePacket(run);
      markLocalFallback();
    }
    const blob = new Blob([packet], { type: "text/markdown;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${run.id}-evidence-packet.md`;
    link.click();
    URL.revokeObjectURL(href);
  }

  async function exportFullAudit() {
    if (!canExportEvidence) {
      markRbacDenied();
      return;
    }
    setBusyAction("audit-export");
    try {
      const auditExport = await getFullAuditExport(actor);
      const body = JSON.stringify(auditExport, null, 2);
      const blob = new Blob([body], { type: "application/json;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = auditExport.generatedAt.replace(/[:.]/g, "-");
      link.href = href;
      link.download = `sentinelops-full-audit-export-${stamp}.json`;
      link.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      if (isForbidden(error)) {
        markRbacDenied();
        return;
      }
      markLocalFallback();
    } finally {
      setBusyAction(null);
    }
  }

  async function routeAlerts() {
    if (!canRouteAlerts) {
      markRbacDenied();
      return;
    }
    setBusyAction("alert-dispatch");
    try {
      const response = await dispatchObservabilityAlerts(actor);
      setObservability(response.summary);
      setAlertRouting({
        routes: response.routes,
        dispatches: response.dispatches,
        ledger: response.ledger,
      });
      void refreshSupplementalData();
    } catch (error) {
      if (isForbidden(error)) {
        markRbacDenied();
        return;
      }
      markLocalFallback();
    } finally {
      setBusyAction(null);
    }
  }

  const trustedWorkforceData = trustedWorkforce || trustedWorkforceFallback;
  // Health sector is static-only in this SPA build: always the verified fallback object.
  const healthData = healthSectorFallback;
  const healthSelectedSegment =
    healthData.segments.find((segment) => segment.id === healthData.selectedSegmentId) || healthData.segments[0];
  const healthInForceMet = healthData.hipaaControls.filter((control) => control.met !== false).length;
  const readyEvidenceCount = run.evidence.filter((item) => item.state === "ready").length;
  const totalPolicyChecks = latestPolicyCheck?.checks.length ?? activePolicy?.rules.length ?? 0;
  const sourceCount = policyIntelligence?.counts.sources ?? trustedWorkforceData.counts.sources;
  const policyReviewCount = policyIntelligence?.counts.reviewItems ?? 0;
  const configuredProviders = modelGateway?.counts.configuredLiveProviders ?? 0;
  const deliveryProviders = liveDelivery?.providers.length ?? 0;
  const passingTrustedWorkforceControls = `${trustedWorkforceData.counts.passingControls}/${trustedWorkforceData.counts.totalControls}`;

  const guidedOutcomes: GuidedOutcome[] = [
    {
      id: "ai-governance",
      label: "AI Governance Readiness Pilot",
      summary: "Guide a buyer from workflow scope to human approval and audit proof.",
      detail: "Best first demo for executives, CISOs, compliance owners, and program teams.",
      status: run.approvalState,
      duration: "6 guided steps",
      target: "Command Center",
      actionLabel: "Open pilot flow",
      icon: ShieldCheck,
    },
    {
      id: "personnel-vetting",
      label: "Personnel Vetting / NBIS Readiness",
      summary: "Show how policy, procedure, process, and work instructions fit cleared workflows.",
      detail: "Useful for FSOs, SSOs, ISSMs, security managers, and cleared subcontractors.",
      status: trustedWorkforceData.status,
      duration: "Policy-to-evidence map",
      target: "Personnel Vetting",
      actionLabel: "Open vetting flow",
      icon: UserCheck,
    },
    {
      id: "health",
      label: "Health (HIPAA + FDA) Readiness",
      summary: "Govern healthcare AI under HIPAA and FDA rules — with proof.",
      detail: "For government health, hospitals, health-tech/SaMD vendors, and payers. Not legal advice; no live PHI.",
      status: healthData.status,
      duration: "7 guided steps",
      target: "Health",
      actionLabel: "Open health flow",
      icon: HeartPulse,
    },
    {
      id: "audit-evidence",
      label: "Audit Evidence Package",
      summary: "Collect the approval trail, eval proof, signatures, and exportable packet.",
      detail: "Use when the buyer asks for proof instead of a verbal product claim.",
      status: `${readyEvidenceCount}/${run.evidence.length} ready`,
      duration: "Export-ready",
      target: "Audit Evidence",
      actionLabel: "Open evidence flow",
      icon: Archive,
    },
    {
      id: "technical-console",
      label: "Technical Controls Console",
      summary: "Expose the full model gateway, retrieval, RBAC, policy, and operations detail.",
      detail: "For engineers and security reviewers after they understand the pilot story.",
      status: apiState.label,
      duration: "Advanced view",
      target: "Command Center",
      actionLabel: "Open console",
      icon: TerminalSquare,
    },
  ];

  const guidedStepSets: Record<Exclude<GuidedOutcomeId, "technical-console">, GuidedStep[]> = {
    "ai-governance": [
      {
        id: "scope",
        label: "Scope",
        title: "Start with one controlled AI workflow.",
        body: "Define what the pilot is allowed to do, who owns it, and what proof must exist before it touches real operations.",
        owner: "Program owner",
        status: run.title,
        primaryLabel: "Create assessment",
        action: "new-run",
        advancedTarget: "Command Center",
        checks: [`Trace ${run.traceId}`, `Cloud target: ${run.cloudTarget}`, `Gateway: ${run.modelGateway}`],
      },
      {
        id: "sources",
        label: "Sources",
        title: "Show the policies behind the controls.",
        body: "A buyer should see which official sources are registered and which policy changes still need human review.",
        owner: "Policy owner",
        status: `${sourceCount} sources`,
        primaryLabel: "Confirm sources",
        action: "advance",
        advancedTarget: "Policies",
        checks: [`${sourceCount} source records`, `${policyReviewCount} review queue items`, "New interpretations are not auto-enforced"],
      },
      {
        id: "controls",
        label: "Controls",
        title: "Run the checks before the pilot is trusted.",
        body: "Safety evals, policy checks, gateway controls, and cost limits become the buyer's visible confidence layer.",
        owner: "Security reviewer",
        status: `${passingPolicyChecks}/${totalPolicyChecks || 0} policy checks`,
        primaryLabel: "Run eval pack",
        action: "eval",
        advancedTarget: "Safety Evals",
        checks: [`${run.evals.length} eval signals`, `${configuredProviders} live providers configured`, "Budget and latency guardrails visible"],
      },
      {
        id: "approval",
        label: "Approve",
        title: "Keep the decision human-controlled.",
        body: "The product can prepare evidence and recommendations, but the approval stays with an authorized person.",
        owner: run.approvalGate.owner,
        status: run.approvalGate.state,
        primaryLabel: "Approve gate",
        action: "approve",
        advancedTarget: "Approvals",
        checks: [run.approvalGate.reason, `${run.approvalGate.requiredEvidence.length} evidence requirements`, latestApproval ? "Signature recorded" : "Awaiting signature"],
      },
      {
        id: "packet",
        label: "Packet",
        title: "Export a plain evidence packet.",
        body: "The first useful handoff is a concise file that explains what was checked, who approved it, and what evidence exists.",
        owner: "Audit reviewer",
        status: `${readyEvidenceCount}/${run.evidence.length} ready`,
        primaryLabel: "Export packet",
        action: "export-evidence",
        advancedTarget: "Audit Evidence",
        checks: run.evidence.slice(0, 3).map((item) => `${item.label}: ${item.state}`),
      },
      {
        id: "handoff",
        label: "Handoff",
        title: "Package the full audit story.",
        body: "When a technical buyer asks for depth, export the full JSON audit bundle and let them inspect the console.",
        owner: "Security and operations",
        status: storage?.mode || systemInfo?.storageMode || "local-json",
        primaryLabel: "Export full audit",
        action: "audit-export",
        advancedTarget: "Audit Evidence",
        checks: [apiState.label, `${deliveryProviders} live delivery providers`, latestApproval ? latestApproval.signature.slice(0, 18) : "No approval signature yet"],
      },
    ],
    "personnel-vetting": [
      {
        id: "policy",
        label: "Policy",
        title: "Start with the official rule source.",
        body: "GovernPilot stores the source, the update cadence, and the human approval requirement before a workflow uses it.",
        owner: "Policy owner",
        status: `${trustedWorkforceData.counts.authoritativeSources} authoritative`,
        primaryLabel: "Continue",
        action: "advance",
        advancedTarget: "Personnel Vetting",
        checks: trustedWorkforceData.sources.slice(0, 3).map((source) => `${source.authority}: ${source.label}`),
      },
      {
        id: "procedure",
        label: "Procedure",
        title: "Turn policy into repeatable steps.",
        body: "Procedures explain what the team should do without putting SSNs, biometrics, CUI, or NBIS credentials into the app.",
        owner: "FSO / SSO",
        status: `${trustedWorkforceData.procedures.length} templates`,
        primaryLabel: "Continue",
        action: "advance",
        advancedTarget: "Personnel Vetting",
        checks: trustedWorkforceData.procedures.slice(0, 3).map((procedure) => procedure.title),
      },
      {
        id: "process",
        label: "Process",
        title: "Show who owns each lifecycle stage.",
        body: "The process view connects position designation, initiation readiness, adjudication handoff, and continuous vetting.",
        owner: "Security manager",
        status: `${trustedWorkforceData.lifecycle.length} stages`,
        primaryLabel: "Continue",
        action: "advance",
        advancedTarget: "Personnel Vetting",
        checks: trustedWorkforceData.lifecycle.map((stage) => `${stage.label}: ${stage.ownerRole}`),
      },
      {
        id: "work-instructions",
        label: "Instructions",
        title: "Keep task-level work simple and controlled.",
        body: "Work instructions make the workflow usable by naming the task, the owner, the forbidden inputs, and the completion gate.",
        owner: "Task owner",
        status: `${trustedWorkforceData.workInstructions.length} instructions`,
        primaryLabel: "Continue",
        action: "advance",
        advancedTarget: "Personnel Vetting",
        checks: trustedWorkforceData.workInstructions.map((instruction) => `${instruction.title}: ${instruction.completionGate}`),
      },
      {
        id: "boundaries",
        label: "Boundary",
        title: "Protect sensitive personnel data.",
        body: "The app is a readiness and evidence layer. NBIS/eApp stay authoritative, and sensitive applicant data stays out.",
        owner: "Security reviewer",
        status: "No sensitive data",
        primaryLabel: "Continue",
        action: "advance",
        advancedTarget: "Personnel Vetting",
        checks: trustedWorkforceData.dataBoundary.slice(0, 3),
      },
      {
        id: "vetting-evidence",
        label: "Evidence",
        title: "Export proof without making a trust decision.",
        body: "The evidence packet proves the process was modeled and controlled; it does not approve, deny, or adjudicate anyone.",
        owner: "FSO / SSO",
        status: passingTrustedWorkforceControls,
        primaryLabel: "Export packet",
        action: "export-evidence",
        advancedTarget: "Audit Evidence",
        checks: trustedWorkforceData.humanDecisionBoundary.slice(0, 3),
      },
    ],
    health: [
      {
        id: "scope",
        label: "Scope",
        title: "Scope the healthcare AI use case and pick a segment.",
        body: "Name the AI task and choose the buyer segment. Recommended first scope is administrative/operational PHI AI — documentation, scheduling, coding, and prior-auth.",
        owner: "Health program owner",
        status: healthSelectedSegment.label,
        primaryLabel: "Continue",
        action: "advance",
        advancedTarget: "Health",
        checks: [
          `Segment: ${healthSelectedSegment.label} (${healthSelectedSegment.buyers})`,
          `Business Associate when touching ePHI — 45 CFR 164.306(a) (in force)`,
          healthData.recommendedInitialScope,
        ],
      },
      {
        id: "fda-route",
        label: "FDA route",
        title: "FDA route check — answer the four Non-Device CDS questions.",
        body: "Four conjunctive criteria decide the track. Meet all four and it is administrative (non-device). Fail any one and it is an FDA-regulated device (then GMLP, PCCP, and postmarket monitoring apply). In force; the FDA Jan 2025 lifecycle guidance is draft.",
        owner: "Regulatory owner",
        status: healthData.fdaRouting.isDevice ? "FDA device track" : "Administrative track",
        primaryLabel: "Continue",
        action: "advance",
        advancedTarget: "Health",
        checks: [
          ...healthData.fdaRouting.criteria.map((criterion) => `${criterion.expert}: ${criterion.met ? "met" : "not met"}`),
          `Basis: ${healthData.fdaRouting.basis} (in force)`,
        ],
      },
      {
        id: "deid-gate",
        label: "De-identify",
        title: "De-identification gate — choose Safe Harbor or Expert Determination.",
        body: "If data is treated as de-identified, exactly one of two lawful methods is enforced and its evidence captured. A Limited Data Set is not a third method. In force.",
        owner: "Privacy owner",
        status: healthData.deidentification.selectedMethod === "safe-harbor" ? "Safe Harbor" : "Expert Determination",
        primaryLabel: "Continue",
        action: "advance",
        advancedTarget: "Health",
        checks: [
          ...healthData.deidentification.methods.map((method) => `${method.label}: ${method.citation}`),
          `${healthData.deidentification.citation} — in force`,
        ],
      },
      {
        id: "hipaa-posture",
        label: "HIPAA",
        title: "HIPAA controls posture shown as met.",
        body: "Unique-user identity, break-glass access, audit controls, and integrity (hash-chained ledger) map to GovernPilot's existing controls. All in force.",
        owner: "Security owner",
        status: `${healthInForceMet}/${healthData.hipaaControls.length} in-force controls`,
        primaryLabel: "Continue",
        action: "advance",
        advancedTarget: "Health",
        checks: healthData.hipaaControls
          .slice(0, 4)
          .map((control) => `${control.control} — ${control.citation} (in force)`),
      },
      {
        id: "safety",
        label: "Safety",
        title: "Run safety evals, including a PHI-leakage red-team.",
        body: "Safety tests try to make the AI leak identifiers that would fail the Safe Harbor scrub, plus a health-equity / bias eval. The run is blocked if PHI leaks.",
        owner: "AI safety reviewer",
        status: `${healthData.evals.filter((evalItem) => evalItem.passed).length}/${healthData.evals.length} passing`,
        primaryLabel: "Continue",
        action: "advance",
        advancedTarget: "Health",
        checks: healthData.evals.map((evalItem) => `${evalItem.label}: ${evalItem.passed ? "pass" : "review"}`),
      },
      {
        id: "approval",
        label: "Approve",
        title: "A human approves before any action.",
        body: "GovernPilot prepares evidence and recommendations; clinical and trust decisions remain with authorized humans. The decision stays human-controlled.",
        owner: "Authorized approver",
        status: run.approvalState,
        primaryLabel: "Continue",
        action: "advance",
        advancedTarget: "Approvals",
        checks: healthData.humanDecisionBoundary.slice(0, 3),
      },
      {
        id: "evidence",
        label: "Evidence",
        title: "Export an evidence packet mapped to HIPAA and FDA.",
        body: "The packet records the HIPAA control posture, the FDA device-track determination, the proposed NPRM controls (clearly labeled), and the source-identified overlays. It governs the decision and stores no live PHI.",
        owner: "Compliance owner",
        status: healthData.evidencePacket.scope,
        primaryLabel: "Export packet",
        action: "export-evidence",
        advancedTarget: "Audit Evidence",
        checks: healthData.evidencePacket.mappedRequirements.map(
          (requirement) => `${requirement.id}: ${requirement.mapping}`,
        ),
      },
    ],
    "audit-evidence": [
      {
        id: "ledger",
        label: "Ledger",
        title: "Confirm who made the decision.",
        body: "The approval ledger is the first trust anchor: reviewer, role, state, timestamp, and signature.",
        owner: "Security reviewer",
        status: latestApproval ? "Signed" : "Pending",
        primaryLabel: "Continue",
        action: "advance",
        advancedTarget: "Approvals",
        checks: [latestApproval ? latestApproval.reviewer : "No reviewer signature yet", latestApproval ? latestApproval.state : run.approvalGate.state, run.traceId],
      },
      {
        id: "policy-proof",
        label: "Policy",
        title: "Attach the policy decision.",
        body: "Evidence should include the policy result and the controls that passed or still require review.",
        owner: "Policy owner",
        status: latestPolicyCheck?.status || "Pending",
        primaryLabel: "Continue",
        action: "advance",
        advancedTarget: "Policies",
        checks: latestPolicyCheck?.checks.map((check) => `${check.id}: ${check.passed ? "pass" : "review"}`) || ["Policy check pending"],
      },
      {
        id: "eval-proof",
        label: "Evals",
        title: "Refresh the safety proof.",
        body: "Run the eval pack when policy, prompt, retrieval, or model routing changes before a buyer sees the result.",
        owner: "AI safety reviewer",
        status: evalReport ? `${evalReport.passed}/${evalReport.total} passed` : "Ready",
        primaryLabel: "Run eval pack",
        action: "eval",
        advancedTarget: "Safety Evals",
        checks: run.evals.map((metric) => `${metric.label}: ${metric.score}`),
      },
      {
        id: "agent-review",
        label: "Review",
        title: "Generate reviewer guidance.",
        body: "The agent review turns the technical state into a short recommendation and a focused action list for humans.",
        owner: "Security reviewer",
        status: latestAgentReview?.recommendation || "Ready",
        primaryLabel: "Run agent review",
        action: "agent-review",
        advancedTarget: "Command Center",
        checks: latestAgentReview?.requiredActions.slice(0, 3) || ["Tool-use posture", "Approval readiness", "Eval focus"],
      },
      {
        id: "packet-export",
        label: "Packet",
        title: "Export the readable packet.",
        body: "Use this when a buyer, partner, or internal reviewer needs a concise file before deeper technical review.",
        owner: "Audit reviewer",
        status: `${readyEvidenceCount}/${run.evidence.length} ready`,
        primaryLabel: "Export packet",
        action: "export-evidence",
        advancedTarget: "Audit Evidence",
        checks: run.evidence.slice(0, 4).map((item) => `${item.label}: ${item.owner}`),
      },
      {
        id: "full-export",
        label: "Full export",
        title: "Export the machine-readable audit bundle.",
        body: "Use this for technical diligence: events, evidence, policy state, signatures, and system posture in one file.",
        owner: "Technical reviewer",
        status: "JSON bundle",
        primaryLabel: "Export full audit",
        action: "audit-export",
        advancedTarget: "Audit Evidence",
        checks: [apiState.label, storage?.mode || systemInfo?.storageMode || "local-json", `${run.events.length} run events`],
      },
    ],
  };

  const guidedSelectableOutcomeId =
    selectedOutcomeId === "technical-console" ? "ai-governance" : selectedOutcomeId;
  const guidedSteps = guidedStepSets[guidedSelectableOutcomeId];
  const guidedStep = guidedSteps[Math.min(guidedStepIndex, guidedSteps.length - 1)];
  const selectedOutcome = guidedOutcomes.find((outcome) => outcome.id === guidedSelectableOutcomeId) || guidedOutcomes[0];

  function openAdvanced(target = selectedNav) {
    setSelectedNav(target);
    setExperienceMode("advanced");
  }

  function openOverview() {
    setExperienceMode("overview");
  }

  function startGuidedWalkthrough() {
    setSelectedOutcomeId("ai-governance");
    setGuidedStepIndex(0);
    setExperienceMode("guided");
  }

  function selectGuidedOutcome(id: GuidedOutcomeId) {
    if (id === "technical-console") {
      openAdvanced("Command Center");
      return;
    }
    setSelectedOutcomeId(id);
    setGuidedStepIndex(0);
  }

  function moveGuidedStep(offset: number) {
    setGuidedStepIndex((current) => Math.max(0, Math.min(guidedSteps.length - 1, current + offset)));
  }

  const guidedPrimaryDisabled =
    busyAction !== null ||
    (guidedStep.action === "new-run" && !canCreateRun) ||
    (guidedStep.action === "approve" && !canApproveGate) ||
    (guidedStep.action === "eval" && !canRunEvals) ||
    (guidedStep.action === "agent-review" && !canRunAgentReview) ||
    ((guidedStep.action === "export-evidence" || guidedStep.action === "audit-export") && !canExportEvidence);

  async function handleGuidedPrimaryAction() {
    if (guidedStep.action === "advance") {
      moveGuidedStep(1);
      return;
    }
    if (guidedStep.action === "advanced") {
      openAdvanced(guidedStep.advancedTarget);
      return;
    }
    if (guidedStep.action === "new-run") {
      await startAssessment();
      moveGuidedStep(1);
      return;
    }
    if (guidedStep.action === "approve") {
      await setGate("approved");
      moveGuidedStep(1);
      return;
    }
    if (guidedStep.action === "eval") {
      await handleEvalPack();
      moveGuidedStep(1);
      return;
    }
    if (guidedStep.action === "agent-review") {
      await handleAgentReview();
      moveGuidedStep(1);
      return;
    }
    if (guidedStep.action === "export-evidence") {
      await exportEvidence();
      moveGuidedStep(1);
      return;
    }
    await exportFullAudit();
  }

  if (experienceMode === "overview") {
    const evalPassCount = run.evals.filter((metric) => metric.status === "pass").length;
    const heroMetrics = [
      {
        label: "Evidence ready",
        value: `${readyEvidenceCount}/${run.evidence.length}`,
        detail: "Sealed artifacts ready to export for an auditor.",
      },
      {
        label: "Safety tests passing",
        value: evalReport ? `${evalReport.passed}/${evalReport.total}` : `${evalPassCount}/${run.evals.length}`,
        detail: "Latest eval pack: hallucination, policy, tool-use, latency, cost.",
      },
      {
        label: "Approval state",
        value: run.approvalState,
        detail: "A human must clear the gate before any write-capable action.",
      },
    ];
    const readinessMetrics = [
      { label: "Policy checks passing", value: `${passingPolicyChecks}/${totalPolicyChecks || 0}`, detail: "Rules-as-code evaluated for this run." },
      { label: "Official sources", value: String(sourceCount), detail: "Registered, provenance-hashed, human-reviewed." },
      { label: "Live providers configured", value: String(configuredProviders), detail: "Model routes ready behind the API boundary." },
      {
        label: "Vetting controls",
        value: passingTrustedWorkforceControls,
        detail: "Personnel-vetting readiness controls passing.",
      },
    ];
    const sectionCardCounts: Record<SectionId, string> = {
      Overview: "1 view",
      Govern: "2 areas",
      Safety: "1 area",
      Approvals: "2 areas",
      "Proof & Evidence": "1 area",
      "AI Runtime & Operations": "3 areas",
      "Access & Admin": "1 area",
    };
    return (
      <OverviewPage
        apiState={apiState}
        heroMetrics={heroMetrics}
        readinessMetrics={readinessMetrics}
        sectionCardCounts={sectionCardCounts}
        onWalkthrough={startGuidedWalkthrough}
        onExploreConsole={() => openAdvanced("Command Center")}
        onOpenSection={(tab) => openAdvanced(tab)}
        onNewAssessment={startAssessment}
        canCreateRun={canCreateRun}
        busy={busyAction !== null}
      />
    );
  }

  if (experienceMode === "guided") {
    return (
      <div className="guided-shell">
        <header className="guided-topbar">
          <button className="mode-switch light overview-back" onClick={openOverview} type="button">
            <Compass size={15} />
            Overview
          </button>
          <div className="guided-brand">
            <span>
              <ShieldCheck size={20} strokeWidth={2.2} />
            </span>
            <div>
              <strong>GovernPilot</strong>
              <small>Guided readiness pilot</small>
            </div>
          </div>
          <div className={`live-state ${apiState.mode}`}>
            <span />
            {apiState.label}
          </div>
          <button className="mode-switch" onClick={() => openAdvanced("Command Center")} type="button">
            <TerminalSquare size={15} />
            Advanced Console
          </button>
          <button className="primary-action guided-new-run" disabled={busyAction !== null || !canCreateRun} onClick={startAssessment} type="button">
            <Play size={16} fill="currentColor" />
            New Assessment
          </button>
        </header>

        <main className="guided-main">
          <section className="guided-hero" aria-label="Guided GovernPilot entry">
            <div className="guided-hero-copy">
              <span>Start here</span>
              <h1>Choose the buyer outcome, then follow the pilot steps.</h1>
              <p>
                This view keeps the full system intact but shows a first-time user what to do next: scope the pilot,
                confirm sources, approve the gate, and export proof.
              </p>
              <div className="guided-hero-actions">
                <button className="primary-action" onClick={() => selectGuidedOutcome("ai-governance")} type="button">
                  <ShieldCheck size={16} />
                  Start governance pilot
                </button>
                <button className="mode-switch light" onClick={() => openAdvanced(selectedOutcome.target)} type="button">
                  <TerminalSquare size={15} />
                  View details
                </button>
              </div>
            </div>
            <aside className="guided-health-panel" aria-label="Current pilot health">
              <Setting label="Current gate" value={run.approvalState} />
              <Setting label="Evidence ready" value={`${readyEvidenceCount}/${run.evidence.length}`} />
              <Setting label="Policy checks" value={`${passingPolicyChecks}/${totalPolicyChecks || 0}`} />
              <Setting label="Role" value={currentRole?.label || "Security Reviewer"} />
            </aside>
          </section>

          <section className="guided-section-heading">
            <div>
              <span className="public-kicker">Pilot launcher</span>
              <h2>Pick the job this app needs to do.</h2>
            </div>
          </section>

          <section className="outcome-grid" aria-label="Guided outcomes">
            {guidedOutcomes.map((outcome) => {
              const Icon = outcome.icon;
              const selected = outcome.id === guidedSelectableOutcomeId;
              return (
                <button
                  aria-label={`${outcome.actionLabel}: ${outcome.label}`}
                  className={selected ? "outcome-card selected" : "outcome-card"}
                  key={outcome.id}
                  onClick={() => selectGuidedOutcome(outcome.id)}
                  type="button"
                >
                  <span className="outcome-icon">
                    <Icon size={19} />
                  </span>
                  <div>
                    <strong>{outcome.label}</strong>
                    <p>{outcome.summary}</p>
                  </div>
                  <small>{outcome.detail}</small>
                  <footer>
                    <code>{outcome.status}</code>
                    <em>{outcome.duration}</em>
                  </footer>
                </button>
              );
            })}
          </section>

          <section className="guided-workspace" aria-label={`${selectedOutcome.label} guided workflow`}>
            <aside className="flow-rail">
              <span className="panel-label">Workflow</span>
              <strong>{selectedOutcome.label}</strong>
              <div className="flow-step-list">
                {guidedSteps.map((step, index) => (
                  <button
                    className={index === guidedStepIndex ? "flow-step active" : index < guidedStepIndex ? "flow-step complete" : "flow-step"}
                    key={step.id}
                    onClick={() => setGuidedStepIndex(index)}
                    type="button"
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{step.label}</strong>
                      <small>{step.owner}</small>
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            <article className="step-panel">
              <div className="step-panel-header">
                <div>
                  <span>{guidedStep.label}</span>
                  <h2>{guidedStep.title}</h2>
                </div>
                <code>{guidedStep.status}</code>
              </div>
              <p>{guidedStep.body}</p>
              <div className="step-facts">
                <Setting label="Owner" value={guidedStep.owner} />
                <Setting label="Advanced view" value={guidedStep.advancedTarget} />
                <Setting label="Current role" value={currentRole?.label || "Security Reviewer"} />
              </div>
              <div className="step-checks" aria-label="Visible proof points">
                {guidedStep.checks.map((check) => (
                  <div className="check-row" key={check}>
                    <CheckCircle2 size={16} />
                    <span>{check}</span>
                  </div>
                ))}
              </div>
              <div className="guided-action-row">
                <button className="primary-action" disabled={guidedPrimaryDisabled} onClick={handleGuidedPrimaryAction} type="button">
                  <Play size={15} fill="currentColor" />
                  {guidedStep.primaryLabel}
                </button>
                <button className="mode-switch light" onClick={() => openAdvanced(guidedStep.advancedTarget)} type="button">
                  <TerminalSquare size={15} />
                  View technical detail
                </button>
              </div>
            </article>

            <aside className="guided-context-panel">
              <SectionHeading title="What the buyer can trust" action="Visible proof" />
              <div className="proof-list">
                <div className="proof-row">
                  <CheckCircle2 size={16} />
                  <span>Policy sources and change reviews are visible before enforcement.</span>
                </div>
                <div className="proof-row">
                  <CheckCircle2 size={16} />
                  <span>Approval remains a human decision with role-aware controls.</span>
                </div>
                <div className="proof-row">
                  <CheckCircle2 size={16} />
                  <span>Evidence can be exported for buyer, auditor, or technical review.</span>
                </div>
              </div>
              <button className="secondary-action spacing-top" onClick={() => openAdvanced("Proof Package")} type="button">
                <FileCheck2 size={16} />
                Open proof package
              </button>
            </aside>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ShieldCheck size={21} strokeWidth={2.2} />
          </div>
          <div>
            <strong>GovernPilot</strong>
            <span>AI governance readiness</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {sectionDefs.map((section) => {
            const Icon = section.icon;
            const isOverviewSection = section.id === "Overview";
            const sectionActive = tabToSection[selectedNav] === section.id;
            const showSubTabs = sectionActive && section.subTabs.length > 1;
            return (
              <div className="nav-section" key={section.id}>
                <button
                  className={sectionActive ? "nav-item active" : "nav-item"}
                  onClick={() => (isOverviewSection ? openOverview() : setSelectedNav(section.subTabs[0].tab))}
                  type="button"
                  aria-label={section.name}
                >
                  <Icon size={17} strokeWidth={2.1} />
                  <span>
                    <strong>{section.name}</strong>
                    <small>{section.description}</small>
                  </span>
                </button>
                {showSubTabs ? (
                  <div className="nav-subtabs">
                    {section.subTabs.map((sub) => (
                      <button
                        className={selectedNav === sub.tab ? "nav-subtab active" : "nav-subtab"}
                        key={sub.tab}
                        onClick={() => setSelectedNav(sub.tab)}
                        type="button"
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <button
          className={selectedNav === proofNavItem.label ? "proof-nav active" : "proof-nav"}
          onClick={() => setSelectedNav(proofNavItem.label)}
          type="button"
        >
          <ProofIcon size={17} strokeWidth={2.1} />
          <span>
            <strong>{proofNavItem.label}</strong>
            <small>{proofNavItem.description}</small>
          </span>
        </button>

        <div className="sidebar-panel">
          <span className="panel-label">Operating model</span>
          <strong>Define → Check → Approve → Prove</strong>
          <p>Every workflow should show source, owner, human decision, and exportable proof.</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          {selectedNav === "Command Center" ? (
            <div className="searchbox">
              <Search size={16} />
              <input
                aria-label="Search risks and controls"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search risks, controls, traces"
                value={query}
              />
            </div>
          ) : null}
          <button className="mode-switch" onClick={openOverview} type="button">
            <Compass size={15} />
            Overview
          </button>
          <button className="mode-switch" onClick={startGuidedWalkthrough} type="button">
            <ShieldCheck size={15} />
            Walk me through it
          </button>
          <button className="env-selector" type="button">
            <LockKeyhole size={15} />
            GovCloud pilot
            <ChevronDown size={15} />
          </button>
          <button className="reviewer-chip" onClick={() => setSelectedNav("Settings")} type="button">
            <UserCheck size={15} />
            {currentRole?.label || "Security Reviewer"}
          </button>
          <div className={`live-state ${apiState.mode}`}>
            <span />
            {apiState.label}
          </div>
          <button className="primary-action" disabled={busyAction !== null || !canCreateRun} onClick={startAssessment} type="button">
            <Play size={16} fill="currentColor" />
            New Assessment
          </button>
        </header>

        <PageHero page={currentPage} run={run} selectedNav={selectedNav} />

        {selectedNav === "Command Center" ? (
          <section className="experience-map" aria-label="GovernPilot workflow map">
            {commandDomains.map((domain) => {
              const Icon = domain.icon;
              return (
                <button className="journey-card" key={domain.label} onClick={() => setSelectedNav(domain.target)} type="button">
                  <span>
                    <Icon size={18} />
                  </span>
                  <strong>{domain.label}</strong>
                  <p>{domain.detail}</p>
                  <small>{domain.metric}</small>
                </button>
              );
            })}
          </section>
        ) : null}

        {selectedNav === "Command Center" ? (
          <section className="run-header">
          <div>
            <h2>{run.title}</h2>
            <p>{run.summary}</p>
          </div>
          <div className="run-meta" aria-label="Run metadata">
            <Meta label="Applicant" value={run.applicant} />
            <Meta label="Trace" value={run.traceId} />
            <Meta label="Approval" value={run.approvalState} strong />
          </div>
          </section>
        ) : null}

        {selectedNav === "Command Center" ? (
          <section className="overview-strip">
          <Metric label="Cloud target" value={run.cloudTarget} icon={<DatabaseZap size={18} />} />
          <Metric label="Gateway" value={run.modelGateway} icon={<TerminalSquare size={18} />} />
          <Metric label="Control profile" value={run.nistProfile} icon={<ListChecks size={18} />} />
          <Metric label="Started" value={run.startedAt} icon={<Clock3 size={18} />} />
          </section>
        ) : null}

        {selectedNav === "Command Center" ? (
          <>
            <section className="work-grid">
          <div className="timeline-panel">
            <SectionHeading title="Agent Run Timeline" action={apiState.mode === "api" ? "API trace" : "Local trace"} />
            <div className="timeline">
              {run.agents.map((agent) => (
                <article className="agent-row" key={agent.id}>
                  <StatusGlyph status={agent.status} />
                  <div className="agent-copy">
                    <div className="agent-title">
                      <strong>{agent.name}</strong>
                      <span>{agent.role}</span>
                    </div>
                    <p>{agent.output}</p>
                    <div className="agent-foot">
                      <span>{agent.time}</span>
                      <code>{agent.traceId}</code>
                    </div>
                  </div>
                  <StatusPill status={agent.status} />
                </article>
              ))}
            </div>
          </div>

          <aside className="approval-panel">
            <SectionHeading title="Approval Gate" action={run.approvalGate.state} />
            <div className={`severity-band ${run.approvalGate.severity}`} />
            <h2>{run.approvalGate.title}</h2>
            <p>{run.approvalGate.reason}</p>
            <dl className="gate-details">
              <div>
                <dt>Owner</dt>
                <dd>{run.approvalGate.owner}</dd>
              </div>
              <div>
                <dt>Requested by</dt>
                <dd>{run.approvalGate.requestedBy}</dd>
              </div>
              <div>
                <dt>Requested</dt>
                <dd>{run.approvalGate.requestedAt}</dd>
              </div>
            </dl>
            <div className="evidence-list">
              {run.approvalGate.requiredEvidence.map((item) => (
                <span key={item}>
                  <FileCheck2 size={14} />
                  {item}
                </span>
              ))}
            </div>
            <div className="gate-actions">
              <button className="approve" disabled={busyAction !== null || !canApproveGate} onClick={() => setGate("approved")} type="button">
                <CheckCircle2 size={17} />
                Approve
              </button>
              <button className="deny" disabled={busyAction !== null || !canDenyGate} onClick={() => setGate("denied")} type="button">
                <XCircle size={17} />
                Deny
              </button>
            </div>
            <div className="gate-summary">
              <span>
                {latestPolicyCheck
                  ? `Policy ${latestPolicyCheck.status}: ${passingPolicyChecks}/${latestPolicyCheck.checks.length} checks`
                  : "Policy check pending"}
              </span>
              <code>{latestApproval ? latestApproval.signature.slice(0, 14) : "unsigned"}</code>
            </div>
          </aside>
            </section>

            <section className="lower-grid">
          <div className="matrix-panel">
            <SectionHeading title="Risk / Control Matrix" action={`${filteredRisks.length} controls`} />
            <div className="matrix-table" role="table" aria-label="Risk and control matrix">
              <div className="matrix-head" role="row">
                <span>Function</span>
                <span>Risk</span>
                <span>Severity</span>
                <span>Score</span>
                <span>Status</span>
              </div>
              {filteredRisks.map((risk) => (
                <div className="matrix-row" role="row" key={risk.id}>
                  <span className="function-cell">{risk.function}</span>
                  <span>
                    <strong>{risk.label}</strong>
                    <em>{risk.evidence}</em>
                  </span>
                  <SeverityLabel severity={risk.severity} />
                  <span className="score-cell">{risk.score}</span>
                  <span className="status-cell">{risk.status}</span>
                </div>
              ))}
            </div>
          </div>

          <aside className="eval-panel">
            <SectionHeading title="Eval Health" action="Latest pack" />
            <div className="eval-list">
              {run.evals.map((metric) => (
                <div className="eval-card" key={metric.id}>
                  <div>
                    <strong>{metric.label}</strong>
                    <span>{metric.detail}</span>
                  </div>
                  <div className="eval-score">
                    <b>{metric.score}</b>
                    <EvalStatusDot status={metric.status} />
                    <small>{metric.trend}</small>
                  </div>
                </div>
              ))}
            </div>
            <button className="secondary-action" disabled={busyAction !== null || !canRunEvals} onClick={handleEvalPack} type="button">
              <SlidersHorizontal size={16} />
              Run Eval Pack
            </button>
          </aside>

          <aside className="evidence-panel">
            <SectionHeading title="Evidence" action="Exportable" />
            <div className="evidence-rail">
              {run.evidence.map((item) => (
                <div className="evidence-item" key={item.id}>
                  <EvidenceDot state={item.state} />
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.owner}</span>
                  </div>
                </div>
              ))}
            </div>
            <button className="secondary-action full" disabled={busyAction !== null || !canExportEvidence} onClick={exportEvidence} type="button">
              <Download size={16} />
              Export Packet
            </button>
          </aside>

          <aside className="audit-panel">
            <SectionHeading title="Agent Review" action={latestAgentReview?.mode || "Ready"} />
            <div className="agent-review-block">
              <span>{latestAgentReview?.recommendation || "No review run yet"}</span>
              <p>{latestAgentReview?.summary || "Run the reviewer to score approval readiness, tool-use posture, and eval focus."}</p>
              {latestAgentReview?.requiredActions.length ? (
                <ul>
                  {latestAgentReview.requiredActions.slice(0, 3).map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              ) : null}
              {latestAgentReview?.citations.length ? <CitationList citations={latestAgentReview.citations} /> : null}
            </div>
            <button className="secondary-action full" disabled={busyAction !== null || !canRunAgentReview} onClick={handleAgentReview} type="button">
              <Activity size={16} />
              Run Agent Review
            </button>
          </aside>

          <aside className="audit-panel">
            <SectionHeading title="Audit Trail" action={latestApproval ? "Signed" : "Pending"} />
            <div className="signature-block">
              <span>{latestApproval ? "Latest decision hash" : "Awaiting reviewer signature"}</span>
              <code>{latestApproval ? latestApproval.signature.slice(0, 28) : run.traceId}</code>
            </div>
            <div className="audit-events">
              {run.events.slice(0, 4).map((event) => (
                <p key={event}>{event}</p>
              ))}
            </div>
          </aside>
            </section>
          </>
        ) : (
          <DetailView
            activePolicy={activePolicy}
            actor={actor}
            alertRouting={alertRouting}
            approvals={approvals}
            evalReport={evalReport}
            liveDelivery={liveDelivery}
            observability={observability}
            canExportEvidence={canExportEvidence}
            canRunAgentReview={canRunAgentReview}
            canRunEvals={canRunEvals}
            canRouteAlerts={canRouteAlerts}
            costGuardrails={costGuardrails}
            latestAgentReview={latestAgentReview}
            latestApproval={latestApproval}
            latestPolicyCheck={latestPolicyCheck}
            modelGateway={modelGateway}
            onAgentReview={handleAgentReview}
            onActorRoleChange={setActorRole}
            onAuditExport={exportFullAudit}
            onEvalPack={handleEvalPack}
            onExportEvidence={exportEvidence}
            onRouteAlerts={routeAlerts}
            rbacRoles={rbacRoles}
            policyIntelligence={policyIntelligence}
            regoCompatibility={regoCompatibility}
            retrievalReadiness={retrievalReadiness}
            trustedWorkforce={trustedWorkforce || trustedWorkforceFallback}
            rolePermissions={rolePermissions}
            run={run}
            selectedNav={selectedNav}
            storage={storage}
            systemInfo={systemInfo}
            busy={busyAction !== null}
          />
        )}
      </main>
    </div>
  );
}

function PageHero({
  page,
  run,
  selectedNav,
}: {
  page: { eyebrow: string; title: string; secondary?: string; description: string; fit: string };
  run: AssessmentRun;
  selectedNav: string;
}) {
  const isCommandCenter = selectedNav === "Command Center";
  return (
    <section className={isCommandCenter ? "page-hero command" : "page-hero"}>
      <div className="page-hero-copy">
        <span className="eyebrow page-hero-eyebrow">{page.eyebrow}</span>
        <h1>
          {page.title}
          {page.secondary ? <em className="page-hero-secondary"> ({page.secondary})</em> : null}
        </h1>
        <p>{page.description}</p>
      </div>
      <aside className="page-hero-panel">
        {isCommandCenter ? (
          <>
            <span>Current readiness</span>
            <strong>{run.approvalState}</strong>
            <p>Next best action: resolve the approval gate, run safety evals, then export the audit evidence packet.</p>
          </>
        ) : (
          <>
            <span>Where this fits</span>
            <strong>{selectedNav}</strong>
            <p>{page.fit}</p>
          </>
        )}
      </aside>
    </section>
  );
}

const howItWorksSteps = [
  {
    num: "1",
    title: "Define",
    body: "Lay out the AI task and the rules it must follow, in plain checkable form.",
  },
  {
    num: "2",
    title: "Check",
    body: "Run safety tests and deliberate red-team attack drills before it is trusted.",
  },
  {
    num: "3",
    title: "Approve",
    body: "Stop risky actions at a gate where a responsible person must sign off.",
  },
  {
    num: "4",
    title: "Prove",
    body: "Seal tamper-proof, exportable evidence an auditor can verify later.",
  },
];

const overviewProofLinks: { tab: string; label: string; detail: string }[] = [
  { tab: "Approvals", label: "Approval Ledger", detail: "Signed human decisions before any action." },
  { tab: "Audit Evidence", label: "Hash-chain verify", detail: "Tamper-evident record with signed hashes." },
  { tab: "Policies", label: "OPA / Rego export", detail: "Rules-as-code for enterprise policy review." },
  { tab: "Audit Evidence", label: "Full audit bundle", detail: "Machine-readable JSON of the whole run." },
];

const overviewSectorCards: {
  tab: string;
  name: string;
  purpose: string;
  chips: string[];
  foot: string;
  icon: typeof ShieldCheck;
}[] = [
  {
    tab: "Health",
    name: "Health (HIPAA + FDA)",
    purpose: "Govern healthcare AI under HIPAA and FDA rules — with proof.",
    chips: ["HIPAA controls", "FDA route check", "De-identification", "Status-tagged"],
    foot: "7 guided steps",
    icon: HeartPulse,
  },
  {
    tab: "Personnel Vetting",
    name: "Personnel Vetting",
    purpose: "Map Trusted Workforce / NBIS steps to procedures, evidence, and human-only decisions.",
    chips: ["Policy sources", "Lifecycle", "Data boundary", "Evidence"],
    foot: "Policy-to-evidence map",
    icon: UserCheck,
  },
];

const overviewFrameworks = ["NIST AI RMF", "NIST 800-53", "FedRAMP", "OMB AI memos", "CMMC", "GAGS"];

const explainerParagraph =
  "Imagine a company wants to use AI that doesn't just answer questions — it can actually do things, like update records or send information. That's powerful, and in government work it's risky. GovernPilot is the safety system in front of that AI, like mission control in front of a plane. Before the AI acts, it lays out the rules in plain checkable form, runs safety tests and even tries to trick the AI on purpose, stops any risky action at a gate where a responsible person must approve it, and saves sealed, tamper-proof proof of everything — so an auditor can later confirm the AI was used safely and by the book. In short: GovernPilot makes AI prove it's safe, makes a human sign off, and keeps the receipts.";

function OverviewPage({
  apiState,
  heroMetrics,
  readinessMetrics,
  sectionCardCounts,
  onWalkthrough,
  onExploreConsole,
  onOpenSection,
  onNewAssessment,
  canCreateRun,
  busy,
}: {
  apiState: { mode: string; label: string };
  heroMetrics: { label: string; value: string; detail: string }[];
  readinessMetrics: { label: string; value: string; detail: string }[];
  sectionCardCounts: Record<SectionId, string>;
  onWalkthrough: () => void;
  onExploreConsole: () => void;
  onOpenSection: (tab: string) => void;
  onNewAssessment: () => void;
  canCreateRun: boolean;
  busy: boolean;
}) {
  // Section cards mirror the 4-step order, then runtime + admin (Overview itself is excluded).
  const sectionCards = sectionDefs.filter((section) => section.id !== "Overview");
  return (
    <div className="guided-shell">
      <header className="guided-topbar">
        <div className="guided-brand">
          <span>
            <ShieldCheck size={20} strokeWidth={2.2} />
          </span>
          <div>
            <strong>GovernPilot</strong>
            <small>AI governance control tower</small>
          </div>
        </div>
        <div className={`live-state ${apiState.mode}`}>
          <span />
          {apiState.label}
        </div>
        <button className="mode-switch" onClick={onExploreConsole} type="button">
          <TerminalSquare size={15} />
          Explore the console
        </button>
        <button className="primary-action guided-new-run" disabled={busy || !canCreateRun} onClick={onNewAssessment} type="button">
          <Play size={16} fill="currentColor" />
          New Assessment
        </button>
      </header>

      <main className="overview-shell">
        {/* 1. Hero */}
        <section className="ov-hero" aria-label="What GovernPilot is">
          <div className="ov-hero-copy">
            <p className="eyebrow">GOVERNPILOT · AI GOVERNANCE</p>
            <h1>Run AI agents under human-approved governance — with exportable proof.</h1>
            <p className="ov-sub">
              GovernPilot is the control tower for AI: before an AI takes real action in regulated work, a person
              approves it, safety checks run, and every decision is sealed as tamper-proof evidence.
            </p>
            <div className="ov-pillars" aria-label="The three pillars">
              <span className="ov-pillar">
                <UserCheck size={14} />
                Human Approves
              </span>
              <span className="ov-pillar">
                <ShieldCheck size={14} />
                Checks Run
              </span>
              <span className="ov-pillar">
                <Archive size={14} />
                Proof Kept
              </span>
            </div>
            <div className="ov-hero-actions">
              <button className="primary-action" onClick={onWalkthrough} type="button">
                <Play size={16} fill="currentColor" />
                Walk me through it
              </button>
              <button className="mode-switch light" onClick={onExploreConsole} type="button">
                <TerminalSquare size={15} />
                Explore the console
              </button>
            </div>
          </div>
          <aside className="ov-hero-metrics" aria-label="Live readiness signals">
            {heroMetrics.map((metric) => (
              <div className="metric-stat" key={metric.label}>
                <span className="metric-stat-label">{metric.label}</span>
                <strong className="metric-stat-value">{metric.value}</strong>
                <span className="metric-stat-detail">{metric.detail}</span>
              </div>
            ))}
          </aside>
        </section>

        {/* 2. How it works */}
        <section aria-label="How it works">
          <div className="ov-block-head">
            <p className="eyebrow">How it works</p>
            <h2>Define → Check → Approve → Prove</h2>
            <p>Four steps turn an AI task into a governed action with an audit trail anyone can follow.</p>
          </div>
          <div className="ov-steps">
            {howItWorksSteps.map((step) => (
              <article className="ov-step" key={step.num}>
                <span className="ov-step-num">{step.num}</span>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* 3. Section-card grid — the visual table of contents */}
        <section aria-label="Explore the platform">
          <div className="ov-block-head">
            <p className="eyebrow">Explore the platform</p>
            <h2>Every function, grouped into six plain-language areas</h2>
            <p>This is the table of contents. Open any area to see the working console behind it.</p>
          </div>
          <div className="ov-card-grid">
            {sectionCards.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  className="ov-card"
                  key={section.id}
                  onClick={() => onOpenSection(section.subTabs[0].tab)}
                  type="button"
                >
                  <span className="ov-card-icon">
                    <Icon size={20} />
                  </span>
                  <span className="ov-card-name">{section.name}</span>
                  <p className="ov-card-purpose">{section.purpose}</p>
                  <div className="ov-card-chips">
                    {section.insideChips.slice(0, 4).map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                  <div className="ov-card-foot">
                    <span>{sectionCardCounts[section.id]}</span>
                    <ArrowRight size={16} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 3b. Sectors / use cases — guided journeys for specific buyer domains */}
        <section aria-label="Sectors and use cases">
          <div className="ov-block-head">
            <p className="eyebrow">Sectors / use cases</p>
            <h2>Guided journeys for specific buyer domains</h2>
            <p>Each sector models the real flow end to end and keeps every regulatory claim tagged by legal status.</p>
          </div>
          <div className="ov-sector-grid">
            {overviewSectorCards.map((sector) => {
              const Icon = sector.icon;
              return (
                <button className="ov-card ov-sector-card" key={sector.tab} onClick={() => onOpenSection(sector.tab)} type="button">
                  <span className="ov-card-icon">
                    <Icon size={20} />
                  </span>
                  <span className="ov-card-name">{sector.name}</span>
                  <p className="ov-card-purpose">{sector.purpose}</p>
                  <div className="ov-card-chips">
                    {sector.chips.map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                  <div className="ov-card-foot">
                    <span>{sector.foot}</span>
                    <ArrowRight size={16} />
                  </div>
                </button>
              );
            })}
          </div>
          <p className="ov-sector-boundary">
            Informational only, not legal advice. GovernPilot governs the healthcare AI decision and stores no live PHI.
          </p>
        </section>

        {/* 4. Readiness band */}
        <section aria-label="Current readiness">
          <div className="ov-block-head">
            <p className="eyebrow">Working system, live numbers</p>
            <h2>This is a working system, not a slideshow</h2>
          </div>
          <div className="ov-readiness">
            {readinessMetrics.map((metric) => (
              <div className="metric-stat" key={metric.label}>
                <span className="metric-stat-label">{metric.label}</span>
                <strong className="metric-stat-value">{metric.value}</strong>
                <span className="metric-stat-detail">{metric.detail}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Proof band */}
        <section className="ov-proof" aria-label="This is real">
          <div className="ov-block-head" style={{ marginBottom: 0 }}>
            <p className="eyebrow">This is real</p>
            <h2>Inspect the proof yourself</h2>
            <p>Every claim above links to a verifiable surface — plus the public case study and demo.</p>
          </div>
          <div className="ov-proof-links">
            {overviewProofLinks.map((link) => (
              <button className="ov-proof-link" key={link.label} onClick={() => onOpenSection(link.tab)} type="button">
                <FileCheck2 size={18} />
                <span>
                  <strong>{link.label}</strong>
                  <small>{link.detail}</small>
                </span>
              </button>
            ))}
            <a className="ov-proof-link" href="/case-study">
              <FileCheck2 size={18} />
              <span>
                <strong>Public Case Study</strong>
                <small>Employer-facing proof of work.</small>
              </span>
            </a>
            <a className="ov-proof-link" href="/demo-video">
              <Play size={18} />
              <span>
                <strong>Demo Video</strong>
                <small>Recording-ready walkthrough storyboard.</small>
              </span>
            </a>
          </div>
        </section>

        {/* 6. 60-second explainer */}
        <section className="ov-explainer" aria-label="60-second explainer">
          <div className="ov-explainer-mark">
            <Compass size={22} />
          </div>
          <div>
            <p className="eyebrow">Explain it in 60 seconds</p>
            <p>{explainerParagraph}</p>
          </div>
        </section>

        {/* 7. Frameworks footer */}
        <footer className="ov-frameworks">
          <p className="eyebrow">Designed to map onto</p>
          <div className="ov-framework-chips">
            {overviewFrameworks.map((framework) => (
              <span key={framework}>{framework}</span>
            ))}
          </div>
          <p className="ov-maturity">
            Reference implementation is single-tenant and self-assessed (Level L1); designed to map onto these
            frameworks, not itself a federal authorization. Not FedRAMP-authorized.
          </p>
        </footer>
      </main>
    </div>
  );
}

function PublicCaseStudyPage({
  agentMode,
  storageMode,
  version,
}: {
  agentMode: string;
  storageMode: string;
  version: string;
}) {
  return (
    <main className="public-case-study">
      <section className="public-hero">
        <div className="public-hero-copy">
          <div className="public-brand">
            <span>
              <ShieldCheck size={18} />
            </span>
            GovernPilot
          </div>
          <h1>GovernPilot</h1>
          <p className="public-product-line">
            GovernPilot — secure AI governance control plane (engine codename: SentinelOps).
          </p>
          <p>
            Governed agentic AI control plane for regulated enterprise, cleared contractor, and federal-adjacent
            controlled-pilot reviews.
          </p>
          <div className="public-actions">
            <a href="/">
              <TerminalSquare size={16} />
              Open Dashboard
            </a>
            <a href="/demo-video">
              <Play size={16} />
              Demo Storyboard
            </a>
            <a href="/partner-brief">
              <UserCheck size={16} />
              App Brief
            </a>
            <a href="/portfolio-assets/sentinelops-dashboard-case-study.png">
              <FileCheck2 size={16} />
              View Evidence
            </a>
          </div>
        </div>
      </section>

      <section className="public-section public-summary">
        <div>
          <span className="public-kicker">Portfolio proof</span>
          <h2>Built to show secure agentic AI judgment, not a chatbot demo.</h2>
          <p>
            The project connects identity, reviewer authorization, approval gates, model-route guardrails, retrieval
            governance, policy-as-code, evals, audit evidence, observability, alert routing, and GovCloud deployment
            reasoning in one working system.
          </p>
        </div>
        <div className="public-runtime">
          <Setting label="Version" value={version} />
          <Setting label="Agent mode" value={agentMode} />
          <Setting label="Storage" value={storageMode} />
          <Setting label="Truth boundary" value="No live credentials claimed" />
        </div>
      </section>

      <section className="public-metrics" aria-label="Portfolio proof metrics">
        {publicCaseStudyMetrics.map((metric) => (
          <article className="public-metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="public-section">
        <div>
          <span className="public-kicker">Implemented surfaces</span>
          <h2>Evidence reviewers can inspect.</h2>
        </div>
        <div className="public-shot-grid">
          {publicCaseStudyScreenshots.map((shot) => (
            <article className="public-shot" key={shot.title}>
              <img alt={`${shot.title} screenshot`} src={shot.image} />
              <div>
                <strong>{shot.title}</strong>
                <p>{shot.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section public-proof">
        <div>
          <span className="public-kicker">Architecture proof</span>
          <h2>Controls are implemented and tested.</h2>
        </div>
        <div className="public-proof-list">
          {publicCaseStudyProof.map((item) => (
            <div className="public-proof-row" key={item}>
              <CheckCircle2 size={17} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function DemoVideoStoryboardPage({
  agentMode,
  storageMode,
  version,
}: {
  agentMode: string;
  storageMode: string;
  version: string;
}) {
  return (
    <main className="demo-video-page">
      <section className="demo-video-hero">
        <div>
          <span className="public-kicker">Portfolio demo reel</span>
          <h1>GovernPilot Demo Video Storyboard</h1>
          <p>
            Recording-ready sequence for a concise employer walkthrough of governed agentic AI architecture,
            controls, evidence, and deployment reasoning.
          </p>
          <div className="public-actions">
            <a href="/case-study">
              <FileCheck2 size={16} />
              Public Case Study
            </a>
            <a href="/">
              <TerminalSquare size={16} />
              Dashboard
            </a>
            <a href="/partner-brief">
              <UserCheck size={16} />
              App Brief
            </a>
          </div>
        </div>
        <aside className="demo-video-runtime">
          <Setting label="Version" value={version} />
          <Setting label="Agent mode" value={agentMode} />
          <Setting label="Storage" value={storageMode} />
          <Setting label="Recording target" value="4:30" />
        </aside>
      </section>

      <section className="demo-video-stats" aria-label="Demo video package metrics">
        {demoVideoStats.map((stat) => (
          <article className="public-metric" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <p>{stat.detail}</p>
          </article>
        ))}
      </section>

      <section className="demo-video-timeline">
        <div className="demo-video-heading">
          <span className="public-kicker">Timed recording plan</span>
          <h2>Six scenes that map directly to verified screens.</h2>
        </div>
        <div className="demo-scene-list">
          {demoVideoScenes.map((scene, index) => (
            <article className="demo-scene" key={scene.title}>
              <div className="demo-scene-media">
                <img alt={`${scene.title} screenshot`} src={scene.image} />
              </div>
              <div className="demo-scene-copy">
                <div className="demo-scene-meta">
                  <span>{scene.time}</span>
                  <code>{scene.duration}</code>
                  <em>Scene {index + 1}</em>
                </div>
                <h3>{scene.title}</h3>
                <p>{scene.narration}</p>
                <strong>{scene.proof}</strong>
                <code>{scene.route}</code>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function PartnerBriefDeck({ version }: { version: string }) {
  return (
    <main className="partner-brief-page">
      <section className="partner-hero">
        <div className="partner-hero-copy">
          <span className="public-kicker">GovernPilot | Simple app brief</span>
          <h1>AI governance controls for approval, policy, evidence, and audit readiness.</h1>
          <p>
            This is a short overview of the app and a direct link to the working demo. It is written for a quick,
            plain-English review.
          </p>
          <div className="public-actions">
            <a href="/">
              <TerminalSquare size={16} />
              Open App
            </a>
            <a href="/case-study">
              <FileCheck2 size={16} />
              Public Case Study
            </a>
            <a href="/demo-video">
              <Play size={16} />
              Demo Storyboard
            </a>
          </div>
        </div>
        <aside className="partner-hero-panel">
          <Setting label="Version" value={version} />
          <Setting label="App link" value="Live demo" />
          <Setting label="Purpose" value="AI governance" />
          <Setting label="Status" value="Proof of concept" />
        </aside>
      </section>

      <section className="partner-slide-grid" aria-label="Simple app brief">
        {partnerBriefSlides.map((slide, index) => (
          <article className="partner-slide" key={slide.title}>
            <div className="partner-slide-number">{String(index + 1).padStart(2, "0")}</div>
            <div className="partner-slide-copy">
              <span className="public-kicker">{slide.eyebrow}</span>
              <h2>{slide.title}</h2>
              <p>{slide.body}</p>
              <ul>
                {slide.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function DetailView({
  activePolicy,
  actor,
  alertRouting,
  approvals,
  busy,
  canExportEvidence,
  canRunAgentReview,
  canRunEvals,
  canRouteAlerts,
  costGuardrails,
  evalReport,
  liveDelivery,
  latestAgentReview,
  latestApproval,
  latestPolicyCheck,
  modelGateway,
  observability,
  onAgentReview,
  onActorRoleChange,
  onAuditExport,
  onEvalPack,
  onExportEvidence,
  onRouteAlerts,
  rbacRoles,
  policyIntelligence,
  regoCompatibility,
  retrievalReadiness,
  trustedWorkforce,
  rolePermissions,
  run,
  selectedNav,
  storage,
  systemInfo,
}: {
  activePolicy: ActivePolicy | null;
  actor: ReviewerActor;
  alertRouting: AlertRoutingStatus | null;
  approvals: ApprovalRecord[];
  busy: boolean;
  canExportEvidence: boolean;
  canRunAgentReview: boolean;
  canRunEvals: boolean;
  canRouteAlerts: boolean;
  costGuardrails: CostGuardrails | null;
  evalReport: EvalReport | null;
  liveDelivery: LiveDeliveryReadiness | null;
  observability: ObservabilitySummary | null;
  latestAgentReview: AgentReview | null;
  latestApproval: ApprovalRecord | null;
  latestPolicyCheck: PolicyCheck | null;
  modelGateway: ModelGatewayStatus | null;
  onAgentReview: () => void;
  onActorRoleChange: (role: ReviewerRoleId) => void;
  onAuditExport: () => void;
  onEvalPack: () => void;
  onExportEvidence: () => void;
  onRouteAlerts: () => void;
  rbacRoles: RbacRole[];
  policyIntelligence: PolicyIntelligenceStatus | null;
  regoCompatibility: RegoCompatibility | null;
  retrievalReadiness: RetrievalReadiness | null;
  trustedWorkforce: TrustedWorkforceReadiness;
  rolePermissions: RbacPermission[];
  run: AssessmentRun;
  selectedNav: string;
  storage: ApiRunResponse["storage"] | null;
  systemInfo: SystemInfo | null;
}) {
  const approvalRows = approvals.length > 0 ? approvals : latestApproval ? [latestApproval] : [];
  // Health sector is static-only in this SPA: always the verified fallback object.
  const healthData = healthSectorFallback;
  const healthSelectedSegment =
    healthData.segments.find((segment) => segment.id === healthData.selectedSegmentId) || healthData.segments[0];
  const healthInForceMet = healthData.hipaaControls.filter((control) => control.met !== false).length;
  const activeRole = rbacRoles.find((role) => role.id === actor.role) ?? null;
  const availableRoles =
    rbacRoles.length > 0
      ? rbacRoles
      : [
          {
            id: actor.role,
            label: "Security Reviewer",
            description: "Owns approval gates for controlled agent pilots and evidence release.",
            permissions: rolePermissions,
          },
        ];
  const authMode = systemInfo?.authMode || systemInfo?.auth?.mode || "local-dev";
  const authVerifier =
    authMode === "oidc" ? "RS256 + JWKS" : authMode === "jwt" ? "HS256 JWT" : "Local reviewer";
  const jwksStatus = systemInfo?.auth?.oidc?.jwksConfigured
    ? systemInfo.auth.oidc.jwksHost || "Configured"
    : "Not configured";
  const observabilityCounts = observability?.counts;
  const observabilityAlerts = observability?.alerts || [];
  const latestDispatches = alertRouting?.dispatches || [];
  const latestAuditEvents = observability?.recentEvents || [];
  const liveDeliveryProviders = liveDelivery?.providers || [];
  const liveDeliveryControls = liveDelivery?.controls || [];
  const liveDeliveryContracts = liveDelivery?.payloadContracts || [];

  if (selectedNav === "Approvals") {
    return (
      <section className="detail-grid">
        <div className="detail-panel">
          <SectionHeading title="Approval Ledger" action={approvals.length ? `${approvals.length} records` : "No records"} />
          <div className="detail-list">
            {approvalRows.map((approval) => (
              <div className="detail-row" key={approval.id}>
                <span>{approval.state}</span>
                <strong>
                  {approval.reviewer}
                  <small>{approval.reviewerRole || "security-reviewer"}</small>
                </strong>
                <code>{approval.signature.slice(0, 32)}</code>
                <em>{new Date(approval.decidedAt).toLocaleString()}</em>
              </div>
            ))}
          </div>
        </div>
        <aside className="detail-panel">
          <SectionHeading title="Policy Decision" action={latestPolicyCheck?.status || "Pending"} />
          <CheckList checks={latestPolicyCheck?.checks || []} />
        </aside>
      </section>
    );
  }

  if (selectedNav === "Policies") {
    const reviewQueueCount = policyIntelligence?.reviewQueue.length ?? 0;
    return (
      <section className="detail-disclosure-layout">
        <div className="detail-panel primary-panel">
          <SectionHeading title="Active Policy" action={activePolicy?.framework || "Loading"} />
          <p className="detail-copy">{activePolicy?.decision || "Policy data loads from the SentinelOps API."}</p>
          <div className="control-rule-list">
            {(activePolicy?.rules || []).map((rule) => (
              <div className="control-rule" key={rule.id}>
                <code>{rule.id}</code>
                <strong>{rule.label}</strong>
                <SeverityLabel severity={rule.severity} />
              </div>
            ))}
          </div>
        </div>

        <Disclosure
          title="Rule Sources & History"
          status={policyIntelligence?.status || "Loading"}
          count={`${policyIntelligence?.counts.sources ?? 0} sources`}
        >
          <p className="detail-copy">
            Official policy sources are watched for change, but new interpretations stay out of enforcement until a
            customer-approved owner signs the mapping.
          </p>
          <div className="settings-grid compact">
            <Setting label="Sources" value={String(policyIntelligence?.counts.sources ?? 0)} />
            <Setting label="Review queue" value={String(policyIntelligence?.counts.reviewItems ?? 0)} />
            <Setting label="Auto enforce" value={policyIntelligence?.autoEnforceNewPolicy ? "On" : "Off"} />
            <Setting
              label="Controls"
              value={`${policyIntelligence?.counts.passingControls ?? 0}/${policyIntelligence?.counts.totalControls ?? 0}`}
            />
          </div>
          <div className="policy-source-list">
            {(policyIntelligence?.sources || []).slice(0, 5).map((source) => (
              <div className="policy-source-row" key={source.id}>
                <div>
                  <span>{source.authority}</span>
                  <strong>{source.label}</strong>
                  <p>{source.approvalRequirement}</p>
                </div>
                <code>{source.updateCadence}</code>
              </div>
            ))}
            {!policyIntelligence ? <p className="detail-copy">Policy intelligence data loads from the SentinelOps API.</p> : null}
          </div>
        </Disclosure>

        <Disclosure
          title="Policy Change Review"
          status={policyIntelligence?.reviewer.approvalGate || "human-review"}
          count={`${reviewQueueCount} in queue`}
          defaultOpen={reviewQueueCount > 0}
        >
          <div className="policy-review-list">
            {(policyIntelligence?.reviewQueue || []).map((item) => (
              <div className={`policy-review-row ${item.impact}`} key={item.id}>
                <span>{item.status}</span>
                <strong>{item.title}</strong>
                <p>{item.action}</p>
                <code>
                  {item.sourceId} / {item.reviewerRole}
                </code>
              </div>
            ))}
            {!reviewQueueCount ? <p className="detail-copy">No policy changes are awaiting review.</p> : null}
          </div>
        </Disclosure>

        <Disclosure title="Source Trust Controls" status={policyIntelligence?.mode || "registry"}>
          <div className="check-list">
            {(policyIntelligence?.controls || []).map((control) => (
              <div className="check-row" key={control.id}>
                {control.passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <span>
                  {control.label}
                  <small>
                    {control.id} / {control.passed ? "pass" : "review-required"}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </Disclosure>

        <Disclosure title="Required Evidence" count={`${run.approvalGate.requiredEvidence.length} items`}>
          <div className="evidence-list vertical">
            {run.approvalGate.requiredEvidence.map((item) => (
              <span key={item}>
                <FileCheck2 size={14} />
                {item}
              </span>
            ))}
          </div>
        </Disclosure>

        <Disclosure
          title="OPA/Rego Compatibility (rules-as-code export)"
          status={regoCompatibility?.status || "Loading"}
          count={`${regoCompatibility?.counts.modules ?? 0} modules`}
        >
          <p className="detail-copy">
            The active JSON policy-as-code bundle is exported as inspectable Rego modules for enterprise policy-library
            review while the local runtime remains the source of truth.
          </p>
          <div className="settings-grid compact">
            <Setting label="Package root" value={regoCompatibility?.packageRoot || "sentinelops"} />
            <Setting label="Modules" value={String(regoCompatibility?.counts.modules ?? 0)} />
            <Setting label="Rules" value={String(regoCompatibility?.counts.rules ?? activePolicy?.rules.length ?? 0)} />
            <Setting label="Unsupported" value={String(regoCompatibility?.counts.unsupportedConditions ?? 0)} />
          </div>
          <div className="rego-module-list">
            {(regoCompatibility?.modules || []).map((module) => (
              <div className="rego-module-row" key={module.packageName}>
                <strong>{module.packageName}</strong>
                <span>{module.path}</span>
                <code>{module.ruleCount} rules</code>
              </div>
            ))}
            {!regoCompatibility ? <p className="detail-copy">Rego compatibility data loads from the SentinelOps API.</p> : null}
          </div>
          <div className="rego-usage spacing-top">
            <code className="rego-code-block">
              {regoCompatibility?.usage.command ||
                "opa eval --data opa/sentinelops --input input.json data.sentinelops.runtime.allow"}
            </code>
            <div className="operator-list" aria-label="Supported Rego operators">
              {(regoCompatibility?.supportedOperators || ["notEmpty", "equals", "oneOf", "includesAll", "containsAll"]).map(
                (operator) => (
                  <span key={operator}>{operator}</span>
                ),
              )}
            </div>
          </div>
        </Disclosure>
      </section>
    );
  }

  if (selectedNav === "Health") {
    const fdaTrackPill = healthData.fdaRouting.isDevice ? "is-fail" : "is-pass";
    const fdaTrackLabel = healthData.fdaRouting.isDevice ? "FDA device track" : "Administrative track";
    return (
      <section className="detail-grid workforce-layout health-layout">
        <div className="detail-panel workforce-panel primary">
          <SectionHeading title="Health (HIPAA + FDA)" action={healthData.status} />
          <p className="detail-copy">
            Govern healthcare AI under HIPAA and FDA rules — with proof. Every requirement below carries its legal
            status. GovernPilot governs the decision and stores no live PHI.
          </p>
          <p className="health-boundary" role="note">
            <LockKeyhole size={15} />
            <span>{healthData.boundaryLine}</span>
          </p>
          <div className="settings-grid compact">
            <Setting label="Mode" value={healthData.mode} />
            <Setting label="Segment" value={healthSelectedSegment.label} />
            <Setting label="FDA track" value={fdaTrackLabel} />
            <Setting label="In-force controls" value={`${healthInForceMet}/${healthData.hipaaControls.length}`} />
            <Setting label="Safety evals" value={`${healthData.evals.filter((e) => e.passed).length}/${healthData.evals.length}`} />
            <Setting label="De-identification" value={healthData.deidentification.selectedMethod === "safe-harbor" ? "Safe Harbor" : "Expert Determination"} />
          </div>
          <div className="health-segment-grid" aria-label="Buyer segments and applicable regimes">
            {healthData.segments.map((segment) => (
              <article
                className={segment.id === healthData.selectedSegmentId ? "health-segment selected" : "health-segment"}
                key={segment.id}
              >
                <strong>{segment.label}</strong>
                <span>{segment.buyers}</span>
                <ul>
                  {segment.applicableRegimes.map((regime) => (
                    <li key={regime}>{regime}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>

        <aside className="detail-panel workforce-panel">
          <SectionHeading title="Business-Associate Posture" action="In force" />
          <p className="detail-copy">{healthData.businessAssociate.plain}</p>
          <div className="check-list">
            <div className="check-row">
              <CheckCircle2 size={16} />
              <span>
                HIPAA Business Associate when touching ePHI
                <small>{healthData.businessAssociate.citation}</small>
              </span>
              <HealthStatusTag status={healthData.businessAssociate.status} />
            </div>
          </div>
          <p className="health-boundary spacing-top" role="note">
            <LockKeyhole size={15} />
            <span>{healthData.boundaryLine}</span>
          </p>
        </aside>

        <div className="detail-panel workforce-panel">
          <SectionHeading title="FDA Route Check (Non-Device CDS)" action={fdaTrackLabel} />
          <p className="detail-copy">{healthData.fdaRouting.plain}</p>
          <div className="health-result-row">
            <span className={`status-pill ${fdaTrackPill}`}>{fdaTrackLabel}</span>
            <HealthStatusTag status={healthData.fdaRouting.status} />
            <code>{healthData.fdaRouting.basis}</code>
          </div>
          <div className="check-list spacing-top">
            {healthData.fdaRouting.criteria.map((criterion) => (
              <div className="check-row" key={criterion.id}>
                {criterion.met ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <span>
                  {criterion.question}
                  <small>{criterion.expert} · {criterion.met ? "met" : "not met"}</small>
                </span>
              </div>
            ))}
          </div>
          <Disclosure
            title="If routed to the FDA device track"
            count={`${healthData.fdaRouting.deviceTrackControls.length} controls`}
          >
            <div className="check-list">
              {healthData.fdaRouting.deviceTrackControls.map((control) => (
                <div className="check-row" key={control.id}>
                  <ListChecks size={16} />
                  <span>
                    {control.control}
                    <small>{control.id} · {control.citation}</small>
                  </span>
                  <HealthStatusTag status={control.status} />
                </div>
              ))}
            </div>
          </Disclosure>
        </div>

        <aside className="detail-panel workforce-panel">
          <SectionHeading title="De-identification Gate" action="In force" />
          <p className="detail-copy">{healthData.deidentification.plain}</p>
          <div className="health-method-list">
            {healthData.deidentification.methods.map((method) => (
              <article
                className={method.id === healthData.deidentification.selectedMethod ? "health-method selected" : "health-method"}
                key={method.id}
              >
                <div className="health-method-head">
                  <strong>{method.label}</strong>
                  <HealthStatusTag status={healthData.deidentification.status} />
                </div>
                <p>{method.requirement}</p>
                <code>{method.citation}</code>
              </article>
            ))}
          </div>
        </aside>

        <div className="detail-panel workforce-panel">
          <SectionHeading title="HIPAA Controls (In Force)" action={`${healthInForceMet}/${healthData.hipaaControls.length} met`} />
          <div className="check-list">
            {healthData.hipaaControls.map((control) => (
              <div className="check-row" key={control.id}>
                {control.met === false ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                <span>
                  {control.plain}
                  <small>{control.id} · {control.control} · {control.citation}</small>
                </span>
                <HealthStatusTag status={control.status} />
              </div>
            ))}
          </div>
        </div>

        <aside className="detail-panel workforce-panel">
          <SectionHeading title="Proposed — Not Yet Law" action="2025 NPRM" />
          <p className="detail-copy">
            These are from the 2025 HIPAA Security Rule NPRM. They are proposed, not final, and are configured as
            forward-looking — never presented as current legal obligations.
          </p>
          <div className="check-list">
            {healthData.proposedControls.map((control) => (
              <div className="check-row" key={control.id}>
                <Clock3 size={16} />
                <span>
                  {control.plain}
                  <small>{control.id} · {control.control} · {control.citation}</small>
                </span>
                <HealthStatusTag status={control.status} />
              </div>
            ))}
          </div>
        </aside>

        <div className="detail-panel workforce-panel">
          <SectionHeading title="Safety Evals" action={`${healthData.evals.filter((e) => e.passed).length}/${healthData.evals.length} passing`} />
          <div className="check-list">
            {healthData.evals.map((evalItem) => (
              <div className="check-row" key={evalItem.id}>
                {evalItem.passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <span>
                  {evalItem.label}
                  <small>{evalItem.plain}</small>
                </span>
              </div>
            ))}
          </div>
          <div className="proof-list spacing-top">
            {healthData.humanDecisionBoundary.map((boundary) => (
              <div className="proof-row" key={boundary}>
                <CheckCircle2 size={16} />
                <span>{boundary}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="detail-panel workforce-panel">
          <SectionHeading
            title="Overlay Regimes"
            action={(() => {
              const overlays = healthData.overlays || [];
              const inForce = overlays.filter((o) => o.status === "in-force").length;
              const future = overlays.filter((o) => o.status === "future").length;
              const framework = overlays.filter((o) => o.status === "framework-voluntary").length;
              const sourceId = overlays.filter((o) => o.status === "source-identified").length;
              return `${inForce} in force · ${future} future · ${framework} voluntary framework · ${sourceId} source-identified`;
            })()}
          />
          <p className="detail-copy">
            In-force overlays are current binding obligations. Future overlays are enacted or finalized but their
            effective date has not yet been reached — they are not yet current law. Source-identified overlays name an
            official source; the specific requirement text is not asserted until verified.
          </p>
          <div className="check-list">
            {(healthData.overlays || []).map((overlay) => (
              <div className="check-row" key={overlay.id}>
                <FileCheck2 size={16} />
                <span>
                  {overlay.regime} · {overlay.effectiveDate}
                  <small>{overlay.id} · {overlay.plain} · {overlay.citation}</small>
                </span>
                <HealthStatusTag status={overlay.status} />
              </div>
            ))}
          </div>
        </aside>

        <div className="detail-panel workforce-panel">
          <SectionHeading title="Evidence Packet (HIPAA / FDA Mapping)" action={healthData.evidencePacket.scope} />
          <p className="detail-copy">{healthData.evidencePacket.ownerBoundary}</p>
          <div className="check-list">
            {healthData.evidencePacket.mappedRequirements.map((requirement) => (
              <div className="check-row" key={requirement.id}>
                <ListChecks size={16} />
                <span>
                  {requirement.mapping}
                  <small>{requirement.id}</small>
                </span>
                <HealthStatusTag status={requirement.status} />
              </div>
            ))}
          </div>
          <div className="signature-block spacing-top">
            <span>Evidence hash</span>
            <code>{healthData.evidencePacket.evidenceSha256.slice(0, 32)}</code>
          </div>
          <p className="health-boundary spacing-top" role="note">
            <LockKeyhole size={15} />
            <span>{healthData.boundaryLine}</span>
          </p>
        </div>
      </section>
    );
  }

  if (selectedNav === "Personnel Vetting") {
    return (
      <section className="detail-grid workforce-layout">
        <div className="detail-panel workforce-panel primary">
          <SectionHeading title="Trusted Workforce Readiness" action={trustedWorkforce.status} />
          <p className="detail-copy">
            Personnel-vetting support is modeled as a governed workflow: policy sources, procedures, lifecycle stages,
            work instructions, evidence, and human-only trust decisions.
          </p>
          <div className="settings-grid compact">
            <Setting label="Mode" value={trustedWorkforce.mode} />
            <Setting label="Sources" value={String(trustedWorkforce.counts.sources)} />
            <Setting label="Stages" value={String(trustedWorkforce.counts.lifecycleStages)} />
            <Setting label="Procedures" value={String(trustedWorkforce.counts.procedures)} />
            <Setting label="Work instructions" value={String(trustedWorkforce.counts.workInstructions)} />
            <Setting
              label="Controls"
              value={`${trustedWorkforce.counts.passingControls}/${trustedWorkforce.counts.totalControls}`}
            />
          </div>
          <div className="workforce-lifecycle">
            {trustedWorkforce.lifecycle.map((stage) => (
              <article className={`workforce-stage ${stage.status}`} key={stage.id}>
                <span>{stage.label}</span>
                <strong>{stage.title}</strong>
                <p>{stage.aiBoundary}</p>
                <code>{stage.ownerRole}</code>
              </article>
            ))}
          </div>
        </div>

        <aside className="detail-panel workforce-panel">
          <SectionHeading title="NBIS Boundary" action={trustedWorkforce.liveNbisIntegration.requested ? "review-required" : "disabled"} />
          <p className="detail-copy">{trustedWorkforce.liveNbisIntegration.boundary}</p>
          <div className="settings-grid compact">
            <Setting label="Requested" value={trustedWorkforce.liveNbisIntegration.requested ? "Yes" : "No"} />
            <Setting label="Authorized" value={trustedWorkforce.liveNbisIntegration.authorized ? "Yes" : "No"} />
            <Setting label="Account boundary" value={trustedWorkforce.liveNbisIntegration.accountBoundaryApproved ? "Approved" : "Not approved"} />
            <Setting label="Owner" value={trustedWorkforce.liveNbisIntegration.owner} />
          </div>
          <div className="proof-list">
            {trustedWorkforce.humanDecisionBoundary.map((boundary) => (
              <div className="proof-row" key={boundary}>
                <CheckCircle2 size={16} />
                <span>{boundary}</span>
              </div>
            ))}
          </div>
        </aside>

        <div className="detail-panel workforce-panel">
          <SectionHeading title="Official Source Registry" action={`${trustedWorkforce.counts.authoritativeSources} authoritative`} />
          <div className="policy-source-list">
            {trustedWorkforce.sources.map((source) => (
              <div className="policy-source-row" key={source.id}>
                <div>
                  <span>{source.authority}</span>
                  <strong>{source.label}</strong>
                  <p>{source.approvalRequirement}</p>
                  <a href={source.officialUrl === "customer-controlled-vault" ? undefined : source.officialUrl} rel="noreferrer" target="_blank">
                    {source.officialUrl}
                  </a>
                </div>
                <code>{source.updateCadence}</code>
              </div>
            ))}
          </div>
        </div>

        <aside className="detail-panel workforce-panel">
          <SectionHeading title="Policy Controls" action={trustedWorkforce.readinessVersion} />
          <div className="check-list">
            {trustedWorkforce.controls.map((control) => (
              <div className="check-row" key={control.id}>
                {control.passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <span>
                  {control.label}
                  <small>
                    {control.id} / {control.passed ? "pass" : "review-required"}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </aside>

        <div className="detail-panel workforce-panel">
          <SectionHeading title="Procedures" action={`${trustedWorkforce.procedures.length} templates`} />
          <div className="workforce-procedure-list">
            {trustedWorkforce.procedures.map((procedure) => (
              <article className={`workforce-procedure ${procedure.status}`} key={procedure.id}>
                <div>
                  <span>{procedure.status}</span>
                  <strong>{procedure.title}</strong>
                  <p>{procedure.requiredEvidence.join(", ")}</p>
                </div>
                <code>{procedure.ownerRole}</code>
              </article>
            ))}
          </div>
        </div>

        <aside className="detail-panel workforce-panel">
          <SectionHeading title="Work Instructions" action={`${trustedWorkforce.workInstructions.length} task-level`} />
          <div className="work-instruction-list">
            {trustedWorkforce.workInstructions.map((instruction) => (
              <article className="work-instruction-row" key={instruction.id}>
                <span>{instruction.ownerRole}</span>
                <strong>{instruction.title}</strong>
                <p>{instruction.instruction}</p>
                <code>{instruction.completionGate}</code>
              </article>
            ))}
          </div>
        </aside>

        <div className="detail-panel workforce-panel">
          <SectionHeading title="Data Boundary" action={`${trustedWorkforce.counts.blockedDataCategories} blocked categories`} />
          <div className="proof-list">
            {trustedWorkforce.dataBoundary.map((boundary) => (
              <div className="proof-row" key={boundary}>
                <LockKeyhole size={16} />
                <span>{boundary}</span>
              </div>
            ))}
          </div>
          <div className="evidence-list vertical spacing-top">
            {trustedWorkforce.evidencePacket.blockedDataCategories.map((category) => (
              <span key={category}>
                <FileCheck2 size={14} />
                {category}
              </span>
            ))}
          </div>
        </div>

        <aside className="detail-panel workforce-panel">
          <SectionHeading title="Evidence Packet" action={trustedWorkforce.evidencePacket.scope} />
          <div className="settings-grid compact">
            <Setting label="Sources" value={String(trustedWorkforce.evidencePacket.sourceCount)} />
            <Setting label="Stages" value={String(trustedWorkforce.evidencePacket.lifecycleStageCount)} />
            <Setting label="Procedures" value={String(trustedWorkforce.evidencePacket.procedureCount)} />
            <Setting label="Instructions" value={String(trustedWorkforce.evidencePacket.workInstructionCount)} />
          </div>
          <div className="signature-block spacing-top">
            <span>Evidence hash</span>
            <code>{trustedWorkforce.evidencePacket.evidenceSha256.slice(0, 32)}</code>
          </div>
        </aside>
      </section>
    );
  }

  if (selectedNav === "Model Gateway") {
    const gatewayControlsPassing = modelGateway
      ? modelGateway.counts.passingControls === modelGateway.counts.totalControls
      : true;
    const budgetControlsPassing = costGuardrails
      ? costGuardrails.counts.passingControls === costGuardrails.counts.totalControls
      : true;
    return (
      <section className="detail-disclosure-layout gateway-layout">
        <div className="detail-panel primary-panel">
          <SectionHeading title="AI Provider Switchboard" action={modelGateway?.status || "Loading"} />
          <p className="detail-copy">
            Provider routing stays behind the SentinelOps API boundary, with deterministic fallback when live credentials
            are absent or policy checks should block external inference.
          </p>
          <div className="settings-grid compact">
            <Setting label="Preferred route" value={modelGateway?.preferredRouteId || "deterministic-local"} />
            <Setting label="Provider routes" value={String(modelGateway?.counts.providers ?? 3)} />
            <Setting label="Live configured" value={String(modelGateway?.counts.configuredLiveProviders ?? 0)} />
            <Setting
              label="Controls passing"
              value={`${modelGateway?.counts.passingControls ?? 0}/${modelGateway?.counts.totalControls ?? 0}`}
            />
          </div>
          <div className="gateway-provider-list">
            {(modelGateway?.providers || []).map((provider) => (
              <div className={`gateway-provider ${provider.status}`} key={provider.id}>
                <div>
                  <span>{provider.provider}</span>
                  <strong>{provider.label}</strong>
                  <p>{provider.credentialBoundary}</p>
                </div>
                <code>{provider.status}</code>
                <small>{provider.regionPolicy}</small>
              </div>
            ))}
            {!modelGateway ? <p className="detail-copy">Gateway data loads from the SentinelOps API.</p> : null}
          </div>
        </div>

        <Disclosure
          title="Gateway Controls"
          status={modelGateway?.agentMode || systemInfo?.agentMode || "Local"}
          count={`${modelGateway?.counts.passingControls ?? 0}/${modelGateway?.counts.totalControls ?? 0} passing`}
          defaultOpen={!gatewayControlsPassing}
        >
          <div className="check-list">
            {(modelGateway?.controlChecks || []).map((check) => (
              <div className="check-row" key={check.id}>
                <CheckCircle2 size={16} />
                <span>
                  {check.label}
                  <small>
                    {check.id} / {check.passed ? "pass" : "fail"}
                  </small>
                </span>
              </div>
            ))}
            {!modelGateway ? <p className="detail-copy">Gateway controls are pending.</p> : null}
          </div>
        </Disclosure>

        <Disclosure title="Routing Plan" count={`${modelGateway?.counts.routingRules ?? 0} rules`}>
          <div className="gateway-route-list">
            {(modelGateway?.routingPlan || []).map((rule) => (
              <div className="gateway-route-row" key={rule.id}>
                <strong>{rule.routeId}</strong>
                <span>{rule.condition}</span>
                <p>{rule.decision}</p>
              </div>
            ))}
          </div>
        </Disclosure>

        <Disclosure title="Security Boundary" status={modelGateway?.authMode || authMode}>
          <div className="proof-list">
            {(modelGateway?.securityBoundary || []).map((boundary) => (
              <div className="proof-row" key={boundary}>
                <CheckCircle2 size={16} />
                <span>{boundary}</span>
              </div>
            ))}
          </div>
        </Disclosure>

        <Disclosure
          title="Spending & Speed Limits (cost guardrails)"
          status={costGuardrails?.status || "Loading"}
          count={`${costGuardrails?.counts.passingControls ?? 0}/${costGuardrails?.counts.totalControls ?? 0} controls`}
          defaultOpen={!budgetControlsPassing}
        >
          <p className="detail-copy">
            Route estimates are policy inputs for controlled pilots; live billing data stays out of the dashboard until
            approved integration is configured.
          </p>
          <div className="settings-grid compact">
            <Setting label="Run budget" value={`$${(costGuardrails?.policy.defaultRunBudgetUsd ?? 0.5).toFixed(2)}`} />
            <Setting label="Daily ceiling" value={`$${(costGuardrails?.policy.dailyPilotBudgetUsd ?? 25).toFixed(2)}`} />
            <Setting label="Token ceiling" value={String(costGuardrails?.policy.maxTotalTokens ?? 7800)} />
            <Setting label="P95 latency" value={`${costGuardrails?.policy.maxP95LatencyMs ?? 5500} ms`} />
          </div>
          <div className="cost-route-list">
            {(costGuardrails?.routeBudgets || []).map((route) => (
              <div className="cost-route-row" key={route.routeId}>
                <div>
                  <strong>{route.label}</strong>
                  <span>{route.routeId}</span>
                </div>
                <code>{`$${route.estimatedCostUsd.toFixed(4)}`}</code>
                <small>
                  {route.estimatedTotalTokens} tokens / {route.estimatedP95LatencyMs} ms p95
                </small>
              </div>
            ))}
            {!costGuardrails ? <p className="detail-copy">Cost guardrails load from the SentinelOps API.</p> : null}
          </div>
          <div className="check-list spacing-top">
            {(costGuardrails?.controls || []).map((control) => (
              <div className="check-row" key={control.id}>
                {control.passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <span>
                  {control.label}
                  <small>
                    {control.id} / {control.passed ? "pass" : "review-required"}
                  </small>
                </span>
              </div>
            ))}
            {!costGuardrails ? <p className="detail-copy">Budget controls are pending.</p> : null}
          </div>
        </Disclosure>
      </section>
    );
  }

  if (selectedNav === "Knowledge") {
    return (
      <section className="detail-grid retrieval-layout">
        <div className="detail-panel retrieval-panel">
          <SectionHeading title="Retrieval Readiness" action={retrievalReadiness?.status || "Loading"} />
          <p className="detail-copy">
            Local TF-IDF remains the deterministic audit baseline while embedding and pgvector paths are gated behind
            server-side credentials and approved corpus ingestion.
          </p>
          <div className="settings-grid compact">
            <Setting label="Recommended" value={retrievalReadiness?.recommendedBackend || "local-tfidf"} />
            <Setting label="Requested" value={retrievalReadiness?.requestedBackend || "local-tfidf"} />
            <Setting label="Documents" value={String(retrievalReadiness?.corpus.documentCount ?? 0)} />
            <Setting label="Vocabulary" value={String(retrievalReadiness?.corpus.vocabularySize ?? 0)} />
          </div>
          <div className="retrieval-backend-list">
            {(retrievalReadiness?.backends || []).map((backend) => (
              <div className={`retrieval-backend-row ${backend.status}`} key={backend.id}>
                <div>
                  <span>{backend.id}</span>
                  <strong>{backend.label}</strong>
                  <p>{backend.credentialBoundary}</p>
                </div>
                <code>{backend.status}</code>
                <small>{backend.algorithm}</small>
              </div>
            ))}
            {!retrievalReadiness ? <p className="detail-copy">Retrieval readiness data loads from the SentinelOps API.</p> : null}
          </div>
        </div>
        <aside className="detail-panel retrieval-panel">
          <SectionHeading
            title="RAG Controls"
            action={`${retrievalReadiness?.counts.passingControls ?? 0}/${retrievalReadiness?.counts.totalControls ?? 0}`}
          />
          <div className="check-list">
            {(retrievalReadiness?.controls || []).map((control) => (
              <div className="check-row" key={control.id}>
                {control.passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <span>
                  {control.label}
                  <small>
                    {control.id} / {control.passed ? "pass" : "review-required"}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </aside>
        <div className="detail-panel retrieval-panel">
          <SectionHeading title="Probe Citations" action={`${retrievalReadiness?.counts.probeQueries ?? 0} probes`} />
          <div className="retrieval-probe-list">
            {(retrievalReadiness?.probeResults || []).map((probe) => (
              <div className="retrieval-probe-row" key={probe.id}>
                <strong>{probe.id}</strong>
                <span>{probe.topCitationTitle || "No citation"}</span>
                <code>{probe.score.toFixed(2)}</code>
                <small>{probe.matchedTerms.slice(0, 6).join(", ") || "no matched terms"}</small>
              </div>
            ))}
          </div>
        </div>
        <aside className="detail-panel retrieval-panel">
          <SectionHeading title="pgvector Contract" action={retrievalReadiness?.migration.extension || "vector"} />
          <div className="settings-grid compact">
            <Setting label="Table" value={retrievalReadiness?.migration.table || "sentinelops_knowledge_chunks"} />
            <Setting label="Index" value={retrievalReadiness?.migration.index || "vector_cosine_ops"} />
          </div>
          <code className="retrieval-code-block">
            {retrievalReadiness?.migration.sql || "create extension if not exists vector;"}
          </code>
        </aside>
        <aside className="detail-panel retrieval-panel">
          <SectionHeading title="Disclosure Boundary" action={retrievalReadiness?.storageMode || "local-json"} />
          <div className="proof-list">
            {(retrievalReadiness?.disclosureBoundary || []).map((boundary) => (
              <div className="proof-row" key={boundary}>
                <CheckCircle2 size={16} />
                <span>{boundary}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    );
  }

  if (selectedNav === "Safety Evals") {
    return (
      <section className="detail-grid">
        <div className="detail-panel">
          <SectionHeading title="Local Eval Harness" action={evalReport ? `${evalReport.passed}/${evalReport.total} passed` : "No run"} />
          <div className="eval-case-list">
            {(evalReport?.results || []).map((result) => (
              <div className="eval-case" key={result.id}>
                <span className={result.passed ? "case-pass" : "case-fail"}>{result.passed ? "Pass" : "Fail"}</span>
                <strong>{result.id}</strong>
                <p>{result.description}</p>
              </div>
            ))}
          </div>
        </div>
        <aside className="detail-panel">
          <SectionHeading title="Run Controls" action={latestAgentReview?.recommendation || "Ready"} />
          <button className="secondary-action full" disabled={busy || !canRunEvals} onClick={onEvalPack} type="button">
            <SlidersHorizontal size={16} />
            Run Eval Pack
          </button>
          <button className="secondary-action full" disabled={busy || !canRunAgentReview} onClick={onAgentReview} type="button">
            <Activity size={16} />
            Run Agent Review
          </button>
        </aside>
      </section>
    );
  }

  if (selectedNav === "Audit Evidence") {
    return (
      <section className="detail-grid">
        <div className="detail-panel">
          <SectionHeading title="Evidence Packet" action="Markdown export" />
          <div className="evidence-rail wide">
            {run.evidence.map((item) => (
              <div className="evidence-item" key={item.id}>
                <EvidenceDot state={item.state} />
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.owner}</span>
                </div>
              </div>
            ))}
          </div>
          <button className="secondary-action full" disabled={busy || !canExportEvidence} onClick={onExportEvidence} type="button">
            <Download size={16} />
            Export Packet
          </button>
        </div>
        <aside className="detail-panel">
          <SectionHeading title="Agent Review" action={latestAgentReview?.mode || "Pending"} />
          <p className="detail-copy">{latestAgentReview?.summary || "No agent review has been attached to this evidence packet yet."}</p>
          {latestAgentReview?.citations.length ? <CitationList citations={latestAgentReview.citations} /> : null}
        </aside>
        <div className="detail-panel">
          <SectionHeading title="Full Audit Export" action="All runs JSON" />
          <p className="detail-copy">
            Download a permission-gated export with global ledger verification, dataset hashes, run inventory, evidence
            manifest hashes, and retention guidance.
          </p>
          <div className="settings-grid compact">
            <Setting label="Runs" value={String(observabilityCounts?.runs ?? 0)} />
            <Setting label="Approvals" value={String(observabilityCounts?.approvals ?? approvals.length)} />
            <Setting label="Audit events" value={String(observabilityCounts?.auditEvents ?? 0)} />
            <Setting label="Alert dispatches" value={String(observabilityCounts?.alertDispatches ?? latestDispatches.length)} />
          </div>
          <button className="secondary-action full spacing-top" disabled={busy || !canExportEvidence} onClick={onAuditExport} type="button">
            <Download size={16} />
            Download Audit JSON
          </button>
        </div>
      </section>
    );
  }

  if (selectedNav === "Operations") {
    const hasUrgentAlert = observabilityAlerts.some((alert) =>
      ["high", "critical", "warn", "warning", "error"].includes(String(alert.severity).toLowerCase()),
    );
    const deliveryControlsPassing = liveDelivery ? liveDelivery.counts.passingControls === liveDelivery.counts.totalControls : true;
    return (
      <section className="detail-disclosure-layout observability-layout">
        <div className="detail-panel primary-panel">
          <SectionHeading title="Runtime SLOs" action={observability?.agentMode || systemInfo?.agentMode || "Local"} />
          <div className="slo-grid">
            {(observability?.slos || []).map((slo) => (
              <div className={`slo-card ${slo.status}`} key={slo.id}>
                <span>{slo.status}</span>
                <strong>{slo.label}</strong>
                <code>
                  {slo.actual} / {slo.target}
                </code>
                <p>{slo.detail}</p>
              </div>
            ))}
            {!observability ? <p className="detail-copy">Observability data loads from the SentinelOps API.</p> : null}
          </div>
        </div>

        <Disclosure
          title="Alert Routing"
          status={hasUrgentAlert ? "attention" : "nominal"}
          count={`${observabilityAlerts.length} signal${observabilityAlerts.length === 1 ? "" : "s"}`}
          defaultOpen={hasUrgentAlert}
        >
          <div className="alert-list">
            {observabilityAlerts.map((alert) => (
              <div className={`alert-row ${alert.severity}`} key={alert.id}>
                <span>{alert.severity}</span>
                <strong>{alert.title}</strong>
                <p>{alert.detail}</p>
              </div>
            ))}
            {!observabilityAlerts.length ? <p className="detail-copy">No alert signals are available yet.</p> : null}
          </div>
          <button className="secondary-action full spacing-top" disabled={busy || !canRouteAlerts} onClick={onRouteAlerts} type="button">
            <Activity size={16} />
            Route Alerts
          </button>
          <div className="route-list">
            {(alertRouting?.routes || []).map((route) => (
              <div className="route-row" key={route.id}>
                <strong>{route.label}</strong>
                <span>{route.target}</span>
                <code>{route.destination}</code>
              </div>
            ))}
          </div>
        </Disclosure>

        <Disclosure title="Signal Inventory" count={observability?.latestRunId || run.id}>
          <div className="settings-grid compact">
            <Setting label="Runs" value={String(observabilityCounts?.runs ?? 0)} />
            <Setting label="Approvals" value={String(observabilityCounts?.approvals ?? approvals.length)} />
            <Setting label="Policy checks" value={String(observabilityCounts?.policyChecks ?? 0)} />
            <Setting label="Agent reviews" value={String(observabilityCounts?.agentReviews ?? (latestAgentReview ? 1 : 0))} />
            <Setting label="Alert dispatches" value={String(observabilityCounts?.alertDispatches ?? latestDispatches.length)} />
            <Setting label="Audit events" value={String(observabilityCounts?.auditEvents ?? 0)} />
            <Setting label="Retrieval algorithms" value={observability?.signals.retrieval.algorithms.join(", ") || "none"} />
          </div>
        </Disclosure>

        <Disclosure title="Dispatch Ledger" status={alertRouting?.ledger.passed ? "Verified" : "Pending"}>
          <div className="dispatch-list">
            {latestDispatches.slice(0, 4).map((dispatch) => (
              <div className="dispatch-row" key={dispatch.id}>
                <span>{dispatch.deliveryStatus}</span>
                <strong>{dispatch.routeLabel}</strong>
                <p>{dispatch.alertTitle}</p>
                <code>{dispatch.signature.slice(0, 24)}</code>
              </div>
            ))}
            {!latestDispatches.length ? <p className="detail-copy">No alert dispatches have been simulated yet.</p> : null}
          </div>
        </Disclosure>

        <Disclosure
          title="Recent Audit Events"
          count={latestAuditEvents.length ? `${latestAuditEvents.length} latest` : "none"}
        >
          <div className="audit-events compact">
            {latestAuditEvents.map((event) => (
              <p key={event.id}>
                <strong>{event.runId}</strong>
                {event.event}
              </p>
            ))}
            {!latestAuditEvents.length ? <p>No audit events are available yet.</p> : null}
          </div>
        </Disclosure>

        <Disclosure
          title="Live Delivery Readiness"
          status={liveDelivery?.status || "Loading"}
          count={`${liveDelivery?.counts.configuredProviders ?? 0}/${liveDelivery?.counts.providers ?? 4} providers`}
          defaultOpen={!deliveryControlsPassing}
        >
          <p className="detail-copy">
            Email, Slack, webhook, and SIEM delivery stay disabled until approval and server-side provider settings are present.
          </p>
          <div className="settings-grid compact">
            <Setting label="Mode" value={liveDelivery?.mode || "simulated-local"} />
            <Setting label="Approved" value={liveDelivery?.liveApproved ? "Yes" : "No"} />
            <Setting label="Providers ready" value={`${liveDelivery?.counts.configuredProviders ?? 0}/${liveDelivery?.counts.providers ?? 4}`} />
            <Setting
              label="Controls passing"
              value={`${liveDelivery?.counts.passingControls ?? 0}/${liveDelivery?.counts.totalControls ?? 0}`}
            />
          </div>
          <div className="delivery-provider-list">
            {liveDeliveryProviders.map((provider) => (
              <div className={`delivery-provider-row ${provider.status}`} key={provider.id}>
                <div>
                  <span>{provider.target}</span>
                  <strong>{provider.label}</strong>
                  <p>{provider.credentialBoundary}</p>
                </div>
                <code>{provider.status}</code>
                <small>{provider.payloadContract}</small>
              </div>
            ))}
            {!liveDelivery ? <p className="detail-copy">Delivery readiness data loads from the SentinelOps API.</p> : null}
          </div>
          <div className="check-list spacing-top">
            {liveDeliveryControls.map((control) => (
              <div className="check-row" key={control.id}>
                {control.passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <span>
                  {control.label}
                  <small>
                    {control.id} / {control.passed ? "pass" : "review-required"}
                  </small>
                </span>
              </div>
            ))}
          </div>
          <div className="contract-list spacing-top">
            {liveDeliveryContracts.slice(0, 4).map((contract) => (
              <div className="contract-row" key={contract.id}>
                <strong>{contract.id}</strong>
                <code>{contract.fields.join(", ")}</code>
                <p>{contract.boundary}</p>
              </div>
            ))}
          </div>
          <div className="proof-list spacing-top">
            {(liveDelivery?.disclosureBoundary || []).map((boundary) => (
              <div className="proof-row" key={boundary}>
                <CheckCircle2 size={16} />
                <span>{boundary}</span>
              </div>
            ))}
          </div>
        </Disclosure>
      </section>
    );
  }

  if (selectedNav === "Proof Package") {
    const passingSlos = observability?.slos.filter((slo) => slo.status === "pass").length ?? 5;
    const totalSlos = observability?.slos.length ?? 5;
    const evalScore = evalReport ? `${evalReport.passed}/${evalReport.total}` : "6/6";
    const routeCount = alertRouting?.routes.length ?? 3;
    const portfolioChecks = portfolioArtifacts.length;

    return (
      <section className="detail-grid case-study-layout">
        <div className="detail-panel case-study-panel primary">
          <SectionHeading title="Employer Signal" action="Portfolio ready" />
          <p className="detail-copy">
            SentinelOps AI packages a governed agentic AI deployment pattern for AI Solutions Architect, LLMOps,
            AI Governance, cleared DevSecOps, and enterprise automation roles.
          </p>
          <div className="case-metric-grid">
            <div className="case-metric">
              <span>Eval gate</span>
              <strong>{evalScore}</strong>
              <p>Regression pack covers approval bypass, prompt injection, retrieval drift, and missing evidence.</p>
            </div>
            <div className="case-metric">
              <span>Runtime SLOs</span>
              <strong>
                {passingSlos}/{totalSlos}
              </strong>
              <p>Ledger, eval, policy, retrieval, audit, and alert signals are summarized for operators.</p>
            </div>
            <div className="case-metric">
              <span>Alert routes</span>
              <strong>{routeCount}</strong>
              <p>Email, Slack, and SIEM-style dispatch paths require the route-alerts permission.</p>
            </div>
            <div className="case-metric">
              <span>Artifacts</span>
              <strong>{portfolioChecks}</strong>
              <p>GAGS standard, signed conformance report, SSP/POA&M, and governance charter are verified in the repo.</p>
            </div>
          </div>
        </div>

        <aside className="detail-panel">
          <SectionHeading title="Verification Pack" action={systemInfo?.version || "0.22.0"} />
          <div className="portfolio-artifacts">
            {portfolioArtifacts.map((artifact) => (
              <div className="portfolio-artifact" key={artifact.path}>
                <FileCheck2 size={15} />
                <div>
                  <strong>{artifact.label}</strong>
                  <code>{artifact.path}</code>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="detail-panel">
          <SectionHeading title="Architecture Proof" action={authVerifier} />
          <div className="proof-list">
            {architectureProofPoints.map((point) => (
              <div className="proof-row" key={point}>
                <CheckCircle2 size={16} />
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="detail-panel">
          <SectionHeading title="Resume Bullets" action="Truthful insert" />
          <div className="resume-bullet-list">
            {resumeBullets.map((bullet) => (
              <p key={bullet}>{bullet}</p>
            ))}
          </div>
        </aside>

        <div className="detail-panel">
          <SectionHeading title="Interview Talk Track" action={run.traceId} />
          <ol className="talk-track-list">
            {interviewTalkTrack.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>

        <aside className="detail-panel">
          <SectionHeading title="Proof Boundary" action={storage?.mode || systemInfo?.storageMode || "local-json"} />
          <p className="detail-copy">
            This is a working local proof-of-work with deterministic demos, documented GovCloud pilot mapping, and no
            claim that live production credentials or classified data are present.
          </p>
          <div className="settings-grid compact">
            <Setting label="Auth mode" value={authMode} />
            <Setting label="Storage" value={storage?.mode || systemInfo?.storageMode || "local-json"} />
            <Setting label="Agent mode" value={systemInfo?.agentMode || "deterministic-local"} />
            <Setting label="Role count" value={String(systemInfo?.roleCount ?? availableRoles.length)} />
          </div>
        </aside>
      </section>
    );
  }

  return (
    <section className="detail-grid">
      <div className="detail-panel">
        <SectionHeading title="Runtime Settings" action={systemInfo?.agentMode || "Local"} />
        <div className="role-card">
          <div className="role-control">
            <label htmlFor="reviewer-role">Reviewer Role</label>
            <select
              id="reviewer-role"
              onChange={(event) => onActorRoleChange(event.target.value as ReviewerRoleId)}
              value={actor.role}
            >
              {availableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>
          <p>{activeRole?.description || availableRoles[0].description}</p>
          <div className="permission-list">
            {rolePermissions.map((permission) => (
              <span key={permission}>{permissionLabels[permission]}</span>
            ))}
          </div>
        </div>
        <div className="settings-grid">
          <Setting label="Service" value={systemInfo?.service || "sentinelops-api"} />
          <Setting label="Version" value={systemInfo?.version || "0.22.0"} />
          <Setting label="OpenAI configured" value={systemInfo?.openaiConfigured ? "Yes" : "No"} />
          <Setting label="Agent mode" value={systemInfo?.agentMode || "deterministic-local"} />
          <Setting label="Auth mode" value={authMode} />
          <Setting label="Auth verifier" value={authVerifier} />
          <Setting label="JWKS host" value={jwksStatus} />
          <Setting label="Storage mode" value={storage?.mode || systemInfo?.storageMode || "local-json"} />
          <Setting label="Run count" value={String(systemInfo?.runCount ?? 0)} />
          <Setting label="Alert dispatch count" value={String(systemInfo?.alertDispatchCount ?? 0)} />
          <Setting label="Role count" value={String(systemInfo?.roleCount ?? availableRoles.length)} />
        </div>
      </div>
      <aside className="detail-panel">
        <SectionHeading title="Storage Path" action={storage?.mode || systemInfo?.storageMode || "Local"} />
        <code className="path-code">{storage?.path || systemInfo?.storagePath || "API storage path unavailable"}</code>
        <div className="deployment-evidence">
          <SectionHeading title="Deployment Evidence" action="GovCloud" />
          <div className="doc-link-list">
            {deploymentEvidence.map((item) => (
              <div className="doc-link-row" key={item.path}>
                <strong>{item.label}</strong>
                <code>{item.path}</code>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </section>
  );
}

function Disclosure({
  title,
  count,
  status,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: string;
  status?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="disclosure" open={defaultOpen}>
      <summary>
        <ChevronDown size={16} className="disclosure-chevron" />
        <span className="disclosure-title">{title}</span>
        {status ? <span className="status-pill is-info">{status}</span> : null}
        {count ? <span className="disclosure-count">{count}</span> : null}
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

function CheckList({ checks }: { checks: PolicyCheck["checks"] }) {
  if (checks.length === 0) {
    return <p className="detail-copy">No policy check has been recorded for this run yet.</p>;
  }
  return (
    <div className="check-list">
      {checks.map((check) => (
        <div className="check-row" key={check.id}>
          <CheckCircle2 size={16} />
          <span>
            {check.label}
            {check.source || check.severity ? (
              <small>
                {[check.source, check.severity].filter(Boolean).join(" / ")}
                {check.failedConditions ? ` / ${check.failedConditions} failing condition${check.failedConditions > 1 ? "s" : ""}` : ""}
              </small>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function CitationList({ citations }: { citations: AgentReview["citations"] }) {
  return (
    <div className="citation-list">
      {citations.slice(0, 3).map((citation) => (
        <div className="citation-row" key={citation.id}>
          <strong>{citation.title}</strong>
          <code>{citation.path}</code>
          {citation.retrieval ? (
            <small>
              {citation.retrieval.algorithm} / {citation.score.toFixed(2)} / {citation.retrieval.matchedTerms.slice(0, 4).join(", ")}
            </small>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function HealthStatusTag({ status }: { status: HealthRegStatus }) {
  return (
    <span className={`status-pill health-tag ${healthStatusPillClass[status]}`} title={healthStatusLabels[status]}>
      {healthStatusLabels[status]}
    </span>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="setting-cell">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Meta({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <span>{label}</span>
      {strong ? <strong>{value}</strong> : <code>{value}</code>}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function SectionHeading({ title, action }: { title: string; action: string }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      <span>{action}</span>
    </div>
  );
}

function StatusGlyph({ status }: { status: AgentStatus }) {
  const icons = {
    complete: <CheckCircle2 size={18} />,
    running: <Activity size={18} />,
    queued: <Clock3 size={18} />,
    blocked: <XCircle size={18} />,
  };
  return <span className={`status-glyph ${status}`}>{icons[status]}</span>;
}

function StatusPill({ status }: { status: AgentStatus }) {
  return <span className={`status-pill ${status}`}>{status}</span>;
}

function SeverityLabel({ severity }: { severity: Severity }) {
  return <span className={`severity-label ${severity}`}>{severity}</span>;
}

function EvalStatusDot({ status }: { status: EvalStatus }) {
  return <span className={`eval-dot ${status}`} />;
}

function EvidenceDot({ state }: { state: EvidenceState }) {
  return <span className={`evidence-dot ${state}`} />;
}
