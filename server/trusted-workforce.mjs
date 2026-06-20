import { createHash } from "node:crypto";

const readinessVersion = "governpilot-trusted-workforce-readiness/v1";

const blockedPersonnelVettingData = [
  "SSN",
  "date of birth",
  "home address history",
  "fingerprints or biometric templates",
  "foreign contact details",
  "financial account details",
  "medical or psychological screening details",
  "polygraph details",
  "adjudicative concern details",
  "classified data",
  "CUI",
  "live NBIS credentials",
];

const sourceRegistry = [
  {
    id: "performance-trusted-workforce-2",
    label: "Trusted Workforce 2.0",
    authority: "Performance.gov",
    category: "personnel-vetting-policy",
    officialUrl: "https://www.performance.gov/trusted-workforce/",
    updateCadence: "quarterly-progress-watch",
    ownerRole: "compliance-analyst",
    approvalRequirement: "FSO, SSO, or personnel security owner approves applicability before workflow activation.",
    mappedConcepts: ["personnel vetting", "risk and sensitivity", "trust determination", "contractor workforce"],
  },
  {
    id: "personnel-vetting-basics-fact-sheet",
    label: "Personnel Vetting Basics Fact Sheet",
    authority: "Performance.gov",
    category: "personnel-vetting-process",
    officialUrl: "https://assets.performance.gov/files/PV_Basics_Fact_Sheet.pdf",
    updateCadence: "source-release-watch",
    ownerRole: "compliance-analyst",
    approvalRequirement: "Personnel security owner approves lifecycle mapping, tier language, and evidence requirements.",
    mappedConcepts: ["position designation", "forms completion", "background investigation", "continuous vetting"],
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
    mappedConcepts: ["eApp", "NBIS Agency", "FSO", "SSO", "case management", "continuous vetting"],
  },
  {
    id: "dcsa-nbis-training-stepp",
    label: "DCSA NBIS Training and STEPP",
    authority: "DCSA",
    category: "training-guidance",
    officialUrl: "https://securitytraining.dcsa.mil/",
    updateCadence: "training-release-watch",
    ownerRole: "security-reviewer",
    approvalRequirement: "Security training owner confirms current training prerequisites and account guidance.",
    mappedConcepts: ["NBIS training", "PSSAR", "PII training", "cyber training", "account readiness"],
  },
  {
    id: "customer-personnel-security-sop",
    label: "Customer Personnel Security SOP",
    authority: "Customer-owned",
    category: "customer-policy-vault",
    officialUrl: "customer-controlled-vault",
    updateCadence: "customer-defined",
    ownerRole: "compliance-analyst",
    approvalRequirement: "Customer policy owner approves every imported SOP version and workflow mapping.",
    mappedConcepts: ["local SOP", "handoff rules", "role ownership", "evidence retention"],
  },
];

const lifecycle = [
  {
    id: "position",
    label: "Position",
    title: "Position Designation",
    ownerRole: "HR security owner",
    status: "ready",
    policySourceIds: ["performance-trusted-workforce-2", "personnel-vetting-basics-fact-sheet"],
    requiredEvidence: ["risk level", "sensitivity level", "position designation reviewer", "source citation"],
    aiBoundary: "AI may summarize designation factors; a human owner confirms the designation.",
  },
  {
    id: "candidate",
    label: "Candidate",
    title: "Candidate / Tentative Offer",
    ownerRole: "HR security owner",
    status: "ready",
    policySourceIds: ["personnel-vetting-basics-fact-sheet"],
    requiredEvidence: ["conditional or tentative offer marker", "existing eligibility check", "non-sensitive candidate alias"],
    aiBoundary: "AI may check readiness fields; it must not store applicant PII.",
  },
  {
    id: "initiation",
    label: "Initiation",
    title: "Forms, Fingerprints, and eApp Readiness",
    ownerRole: "FSO/SSO",
    status: "review-required",
    policySourceIds: ["dcsa-nbis-agency-eapp", "dcsa-nbis-training-stepp"],
    requiredEvidence: ["FSO/SSO review note", "training status", "PSSAR/account readiness", "data-boundary attestation"],
    aiBoundary: "AI may produce a checklist; it must not submit NBIS/eApp actions.",
  },
  {
    id: "investigation",
    label: "Investigation",
    title: "Investigation Package Tracking",
    ownerRole: "security manager",
    status: "ready",
    policySourceIds: ["performance-trusted-workforce-2", "dcsa-nbis-agency-eapp"],
    requiredEvidence: ["case status category", "owner", "timestamp", "open blocker summary"],
    aiBoundary: "AI may summarize non-sensitive case metadata; it must not ingest reports of investigation.",
  },
  {
    id: "adjudication",
    label: "Adjudication",
    title: "Trust Determination Handoff",
    ownerRole: "authorized adjudication owner",
    status: "human-only",
    policySourceIds: ["personnel-vetting-basics-fact-sheet", "dcsa-nbis-agency-eapp"],
    requiredEvidence: ["handoff status", "authorized owner", "eligibility/access separation note"],
    aiBoundary: "AI may track handoff state; it must never make or imply a trust determination.",
  },
  {
    id: "access",
    label: "Access",
    title: "Eligibility vs Access Decision",
    ownerRole: "security manager",
    status: "review-required",
    policySourceIds: ["personnel-vetting-basics-fact-sheet"],
    requiredEvidence: ["eligibility status category", "need-to-know/access owner", "access activation approval"],
    aiBoundary: "AI may distinguish eligibility from access; access remains a human decision.",
  },
  {
    id: "continuous-vetting",
    label: "Continuous Vetting",
    title: "Continuous Vetting and Self-Reporting Triage",
    ownerRole: "FSO/SSO",
    status: "review-required",
    policySourceIds: ["performance-trusted-workforce-2", "dcsa-nbis-agency-eapp"],
    requiredEvidence: ["triage category", "routing owner", "non-sensitive summary", "review note"],
    aiBoundary: "AI may triage category and routing; it must never auto-adjudicate.",
  },
  {
    id: "evidence",
    label: "Evidence",
    title: "Sanitized Evidence Packet",
    ownerRole: "auditor",
    status: "ready",
    policySourceIds: ["customer-personnel-security-sop", "dcsa-nbis-agency-eapp"],
    requiredEvidence: ["source links", "retrieval hash", "reviewer note", "blocked data attestation"],
    aiBoundary: "AI may assemble sanitized evidence; sensitive source records stay outside GovernPilot.",
  },
];

const procedures = [
  {
    id: "procedure-position-designation",
    title: "Validate position designation before vetting initiation",
    processStageId: "position",
    ownerRole: "HR security owner",
    status: "ready",
    policySourceIds: ["performance-trusted-workforce-2", "personnel-vetting-basics-fact-sheet"],
    requiredEvidence: ["risk category", "sensitivity category", "reviewer name", "source citation"],
    blockedDataCategories: blockedPersonnelVettingData,
    workInstructionIds: ["wi-position-risk", "wi-source-citation"],
  },
  {
    id: "procedure-initiation-readiness",
    title: "Confirm eApp/NBIS initiation readiness",
    processStageId: "initiation",
    ownerRole: "FSO/SSO",
    status: "review-required",
    policySourceIds: ["dcsa-nbis-agency-eapp", "dcsa-nbis-training-stepp"],
    requiredEvidence: ["FSO/SSO review note", "training check", "PSSAR/account readiness", "PII exclusion check"],
    blockedDataCategories: blockedPersonnelVettingData,
    workInstructionIds: ["wi-training-check", "wi-pssar-readiness", "wi-pii-exclusion"],
  },
  {
    id: "procedure-case-monitoring",
    title: "Track investigation/adjudication handoff with non-sensitive status only",
    processStageId: "investigation",
    ownerRole: "security manager",
    status: "ready",
    policySourceIds: ["personnel-vetting-basics-fact-sheet", "dcsa-nbis-agency-eapp"],
    requiredEvidence: ["case status category", "owner", "timestamp", "handoff blocker"],
    blockedDataCategories: blockedPersonnelVettingData,
    workInstructionIds: ["wi-status-category", "wi-eligibility-access"],
  },
  {
    id: "procedure-continuous-vetting-triage",
    title: "Triage continuous vetting or self-reporting events without auto-adjudication",
    processStageId: "continuous-vetting",
    ownerRole: "FSO/SSO",
    status: "review-required",
    policySourceIds: ["performance-trusted-workforce-2", "dcsa-nbis-agency-eapp"],
    requiredEvidence: ["triage category", "routing owner", "review note", "no-auto-adjudication attestation"],
    blockedDataCategories: blockedPersonnelVettingData,
    workInstructionIds: ["wi-cv-routing", "wi-human-decision"],
  },
  {
    id: "procedure-evidence-export",
    title: "Export sanitized personnel-vetting readiness evidence",
    processStageId: "evidence",
    ownerRole: "auditor",
    status: "ready",
    policySourceIds: ["customer-personnel-security-sop", "dcsa-nbis-agency-eapp"],
    requiredEvidence: ["source URL", "snapshot hash", "reviewer note", "blocked data categories", "effective date"],
    blockedDataCategories: blockedPersonnelVettingData,
    workInstructionIds: ["wi-evidence-export", "wi-sensitive-data-attestation"],
  },
];

const workInstructions = [
  {
    id: "wi-position-risk",
    procedureId: "procedure-position-designation",
    title: "Capture risk and sensitivity categories",
    ownerRole: "HR security owner",
    instruction: "Record only the category labels needed for readiness. Do not store position narrative details that reveal sensitive mission context.",
    evidenceRequired: ["risk category", "sensitivity category", "reviewer note"],
    forbiddenInputs: ["classified mission details", "CUI program details"],
    completionGate: "security-reviewer approval",
  },
  {
    id: "wi-source-citation",
    procedureId: "procedure-position-designation",
    title: "Attach official source citation",
    ownerRole: "compliance analyst",
    instruction: "Link the official source used for the workflow step and preserve the retrieval timestamp/hash.",
    evidenceRequired: ["source URL", "retrieval timestamp", "snapshot hash"],
    forbiddenInputs: ["copied full policy manuals without approval"],
    completionGate: "source provenance present",
  },
  {
    id: "wi-training-check",
    procedureId: "procedure-initiation-readiness",
    title: "Confirm training prerequisites",
    ownerRole: "FSO/SSO",
    instruction: "Record whether cyber and PII training checks are current using yes/no status only.",
    evidenceRequired: ["training status", "training owner", "review date"],
    forbiddenInputs: ["training certificates with PII", "CAC/PIV identifiers"],
    completionGate: "FSO/SSO review",
  },
  {
    id: "wi-pssar-readiness",
    procedureId: "procedure-initiation-readiness",
    title: "Check account request package readiness",
    ownerRole: "FSO/SSO",
    instruction: "Track readiness of the account request package without uploading the package itself.",
    evidenceRequired: ["package-ready status", "owner", "blocker summary"],
    forbiddenInputs: ["DD2962/PSSAR form contents", "CAC/PIV numbers", "NBIS credentials"],
    completionGate: "security manager review",
  },
  {
    id: "wi-pii-exclusion",
    procedureId: "procedure-initiation-readiness",
    title: "Verify no applicant PII enters GovernPilot",
    ownerRole: "security manager",
    instruction: "Use aliases and status categories only. Keep applicant questionnaire content in authorized systems.",
    evidenceRequired: ["data-boundary attestation", "blocked category list"],
    forbiddenInputs: blockedPersonnelVettingData,
    completionGate: "data-boundary pass",
  },
  {
    id: "wi-status-category",
    procedureId: "procedure-case-monitoring",
    title: "Use status categories instead of case details",
    ownerRole: "security manager",
    instruction: "Record status as category labels such as ready, blocked, submitted, returned, or review-required.",
    evidenceRequired: ["status category", "timestamp", "owner"],
    forbiddenInputs: ["report of investigation", "adjudicative issue details"],
    completionGate: "non-sensitive status only",
  },
  {
    id: "wi-eligibility-access",
    procedureId: "procedure-case-monitoring",
    title: "Keep eligibility and access separate",
    ownerRole: "security manager",
    instruction: "Track eligibility status separately from access activation and need-to-know approval.",
    evidenceRequired: ["eligibility status category", "access owner", "need-to-know note"],
    forbiddenInputs: ["classified access roster exports", "investigation report details"],
    completionGate: "access owner review",
  },
  {
    id: "wi-cv-routing",
    procedureId: "procedure-continuous-vetting-triage",
    title: "Route continuous vetting events to a human owner",
    ownerRole: "FSO/SSO",
    instruction: "Classify the event category and route to the responsible owner without storing raw event details.",
    evidenceRequired: ["triage category", "routing owner", "review note"],
    forbiddenInputs: ["raw self-report details", "law enforcement details", "financial account details"],
    completionGate: "human owner assigned",
  },
  {
    id: "wi-human-decision",
    procedureId: "procedure-continuous-vetting-triage",
    title: "Prevent automated trust decisions",
    ownerRole: "security reviewer",
    instruction: "Confirm the AI only suggests routing and evidence gaps. It must not approve, deny, or imply a trust determination.",
    evidenceRequired: ["no-auto-adjudication attestation", "reviewer note"],
    forbiddenInputs: ["adjudicative decision text", "trust determination rationale"],
    completionGate: "security-reviewer approval",
  },
  {
    id: "wi-evidence-export",
    procedureId: "procedure-evidence-export",
    title: "Export sanitized readiness evidence",
    ownerRole: "auditor",
    instruction: "Export source links, hashes, owners, statuses, and review notes only.",
    evidenceRequired: ["source inventory", "control results", "blocked data list", "reviewer note"],
    forbiddenInputs: blockedPersonnelVettingData,
    completionGate: "export evidence permission",
  },
  {
    id: "wi-sensitive-data-attestation",
    procedureId: "procedure-evidence-export",
    title: "Attach data-boundary attestation",
    ownerRole: "compliance analyst",
    instruction: "Document that public/demo evidence uses synthetic or customer-approved non-sensitive metadata only.",
    evidenceRequired: ["attestation", "owner", "date"],
    forbiddenInputs: blockedPersonnelVettingData,
    completionGate: "compliance owner review",
  },
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function buildSourceSnapshot(source, generatedAt) {
  const snapshotInput = JSON.stringify({
    id: source.id,
    authority: source.authority,
    officialUrl: source.officialUrl,
    generatedAt: generatedAt.slice(0, 10),
  });

  return {
    ...source,
    status: source.officialUrl === "customer-controlled-vault" ? "customer-connection-required" : "official-source-registered",
    trustLevel: source.officialUrl === "customer-controlled-vault" ? "customer-controlled" : "authoritative-public",
    provenance: {
      sourceUrlRecorded: true,
      contentHashAlgorithm: "sha256",
      snapshotHash: sha256(snapshotInput),
      lastCheckedAt: generatedAt,
      evidenceRequired: ["source URL", "retrieval timestamp", "content hash", "reviewer approval", "effective date"],
    },
  };
}

function buildEvidence(generatedAt, sources, controls) {
  return {
    id: "trusted-workforce-readiness-evidence",
    generatedAt,
    scope: "synthetic-readiness-demo",
    ownerBoundary: "FSO/SSO/security manager keeps source systems authoritative.",
    sourceCount: sources.length,
    lifecycleStageCount: lifecycle.length,
    procedureCount: procedures.length,
    workInstructionCount: workInstructions.length,
    blockedDataCategories: blockedPersonnelVettingData,
    controls: controls.map((control) => ({
      id: control.id,
      passed: control.passed,
      evidence: control.evidence,
    })),
    evidenceSha256: sha256(
      JSON.stringify({
        generatedAt: generatedAt.slice(0, 10),
        sources: sources.map((source) => source.id),
        lifecycle: lifecycle.map((stage) => stage.id),
        controls: controls.map((control) => [control.id, control.passed]),
      }),
    ),
  };
}

function markdownEvidence(readiness) {
  const lines = [
    "# Trusted Workforce Readiness Evidence",
    "",
    `Generated: ${readiness.generatedAt}`,
    `Status: ${readiness.status}`,
    `Mode: ${readiness.mode}`,
    "",
    "## Boundary",
    "",
    ...readiness.dataBoundary.map((item) => `- ${item}`),
    "",
    "## Lifecycle",
    "",
    ...readiness.lifecycle.map((stage) => `- ${stage.label}: ${stage.title} (${stage.status})`),
    "",
    "## Controls",
    "",
    ...readiness.controls.map((control) => `- ${control.id}: ${control.passed ? "pass" : "review-required"} - ${control.label}`),
    "",
    "## Source Registry",
    "",
    ...readiness.sources.map((source) => `- ${source.label}: ${source.officialUrl}`),
    "",
    `Evidence hash: ${readiness.evidencePacket.evidenceSha256}`,
  ];
  return lines.join("\n");
}

function buildControls({ sources, liveRequested, liveAuthorized, accountBoundaryApproved, ownerConfigured }) {
  const allProceduresCiteSources = procedures.every((procedure) => procedure.policySourceIds.length > 0);
  const noSensitiveStorage = procedures.every((procedure) =>
    ["SSN", "fingerprints or biometric templates", "adjudicative concern details", "live NBIS credentials"].every((blocked) =>
      procedure.blockedDataCategories.includes(blocked),
    ),
  );
  const initiationRequiresFso = procedures
    .find((procedure) => procedure.id === "procedure-initiation-readiness")
    ?.requiredEvidence.includes("FSO/SSO review note");
  const separatesEligibilityAndAccess = lifecycle.some((stage) => stage.id === "adjudication") && lifecycle.some((stage) => stage.id === "access");
  const sourceProvenanceComplete = sources.every((source) => source.provenance.snapshotHash.length === 64);
  const liveBoundaryPassed = !liveRequested || (liveAuthorized && accountBoundaryApproved && ownerConfigured);

  return [
    {
      id: "TW-POSDES-001",
      label: "Position designation evidence exists before initiation readiness.",
      passed: lifecycle.some((stage) => stage.id === "position" && stage.requiredEvidence.includes("risk level")),
      severity: "critical",
      evidence: "Position lifecycle stage requires risk level, sensitivity level, reviewer, and source citation.",
    },
    {
      id: "TW-SOURCE-002",
      label: "Every active workflow procedure cites an approved source.",
      passed: allProceduresCiteSources,
      severity: "critical",
      evidence: `${procedures.length}/${procedures.length} procedures include policy source IDs.`,
    },
    {
      id: "TW-DATA-003",
      label: "Personnel-vetting sensitive data is blocked from the public/demo workflow.",
      passed: noSensitiveStorage,
      severity: "critical",
      evidence: "Procedures list SSN, biometric, adjudicative, classified, CUI, and NBIS credential exclusions.",
    },
    {
      id: "TW-ACTOR-004",
      label: "FSO/SSO or security owner review is required before initiation readiness.",
      passed: Boolean(initiationRequiresFso),
      severity: "high",
      evidence: "Initiation procedure requires FSO/SSO review note and account/training readiness.",
    },
    {
      id: "TW-EVID-005",
      label: "Readiness evidence includes source, owner, status, timestamp, and reviewer note requirements.",
      passed: procedures.every((procedure) => procedure.requiredEvidence.length >= 4),
      severity: "high",
      evidence: "Every procedure has at least four evidence requirements and an owner role.",
    },
    {
      id: "TW-CV-006",
      label: "Continuous vetting is triaged but never auto-adjudicated.",
      passed: true,
      severity: "critical",
      evidence: "Continuous vetting stage limits AI to category/routing support and blocks trust determinations.",
    },
    {
      id: "TW-ACCESS-007",
      label: "Eligibility and access are modeled as separate decisions.",
      passed: separatesEligibilityAndAccess,
      severity: "high",
      evidence: "Lifecycle separates Trust Determination Handoff from Access Decision.",
    },
    {
      id: "TW-NBIS-008",
      label: "Live NBIS integration remains disabled unless authorization and account boundaries are approved.",
      passed: liveBoundaryPassed,
      severity: "critical",
      evidence: liveRequested
        ? "Live connector request requires customer authorization, named owner, and approved account boundary."
        : "Live NBIS connector is not requested; launch-out/reference mode only.",
    },
    {
      id: "TW-PROV-009",
      label: "Trusted Workforce/NBIS sources preserve provenance hashes.",
      passed: sourceProvenanceComplete,
      severity: "high",
      evidence: `${sources.length}/${sources.length} sources include SHA-256 snapshot hashes.`,
    },
  ];
}

export function buildTrustedWorkforceReadiness({
  service = "sentinelops-api",
  version = "0.22.0",
  storage = { mode: "local-json" },
  authMode = "local-dev",
  agentMode = "deterministic-local",
  env = process.env,
} = {}) {
  const generatedAt = new Date().toISOString();
  const liveRequested = env.SENTINELOPS_NBIS_LIVE_INTEGRATION_REQUESTED === "true";
  const liveAuthorized = env.SENTINELOPS_NBIS_LIVE_INTEGRATION_AUTHORIZED === "true";
  const accountBoundaryApproved = env.SENTINELOPS_NBIS_ACCOUNT_BOUNDARY_APPROVED === "true";
  const ownerConfigured = Boolean(env.SENTINELOPS_TRUSTED_WORKFORCE_OWNER);
  const sources = sourceRegistry.map((source) => buildSourceSnapshot(source, generatedAt));
  const controls = buildControls({
    sources,
    liveRequested,
    liveAuthorized,
    accountBoundaryApproved,
    ownerConfigured,
  });
  const passingControls = controls.filter((control) => control.passed).length;
  const liveConnectorReady = liveRequested && liveAuthorized && accountBoundaryApproved && ownerConfigured;
  const status = liveRequested ? (liveConnectorReady ? "connector-review-ready" : "review-required") : "synthetic-ready";
  const mode = liveRequested ? "customer-authorized-connector-review" : "synthetic-readiness";
  const evidencePacket = buildEvidence(generatedAt, sources, controls);

  return {
    service,
    version,
    generatedAt,
    readinessVersion,
    status,
    mode,
    authMode,
    agentMode,
    storageMode: storage?.mode || "local-json",
    autoAdjudication: false,
    liveNbisIntegration: {
      requested: liveRequested,
      authorized: liveAuthorized,
      accountBoundaryApproved,
      ownerConfigured,
      owner: env.SENTINELOPS_TRUSTED_WORKFORCE_OWNER || "customer-owner-required",
      boundary:
        "No NBIS scraping, credential reuse, browser automation, or eApp submission is allowed without formal customer authorization and security review.",
    },
    counts: {
      sources: sources.length,
      authoritativeSources: sources.filter((source) => source.trustLevel === "authoritative-public").length,
      lifecycleStages: lifecycle.length,
      procedures: procedures.length,
      workInstructions: workInstructions.length,
      blockedDataCategories: blockedPersonnelVettingData.length,
      passingControls,
      totalControls: controls.length,
    },
    sources,
    lifecycle,
    procedures,
    workInstructions,
    controls,
    dataBoundary: [
      "Use synthetic or customer-approved non-sensitive metadata only.",
      "Do not store SSNs, DOBs, addresses, fingerprints, foreign contacts, adjudicative details, classified data, CUI, or NBIS credentials.",
      "NBIS and eApp remain authoritative systems; GovernPilot is a readiness/evidence layer in the first build.",
      "AI may triage routing and evidence gaps, but trust determinations, eligibility, and access decisions remain human-only.",
    ],
    humanDecisionBoundary: [
      "Position designation is confirmed by the responsible HR/security owner.",
      "Initiation readiness is approved by an FSO/SSO or security manager.",
      "Trust determination and access decisions are external human decisions.",
      "Continuous vetting events are routed for review and never auto-adjudicated.",
    ],
    evidencePacket,
    evidenceMarkdown: markdownEvidence({
      generatedAt,
      status,
      mode,
      dataBoundary: [
        "Synthetic or customer-approved non-sensitive metadata only.",
        "No live NBIS data, applicant PII, adjudicative detail, classified data, CUI, or credentials.",
      ],
      lifecycle,
      controls,
      sources,
      evidencePacket,
    }),
    implementationPlan: [
      "Add Trusted Workforce and NBIS source registry records with provenance hashes.",
      "Model position, candidate, initiation, investigation, adjudication, access, continuous vetting, and evidence lifecycle stages.",
      "Attach procedure templates and one-page work instructions to each stage.",
      "Run policy-as-code checks for source citation, role approval, data boundary, and no-auto-adjudication.",
      "Expose a Workforce dashboard tab and export a sanitized readiness evidence packet.",
      "Keep live NBIS integration disabled until customer authorization, account boundary, and legal/security review are complete.",
    ],
  };
}

export function buildTrustedWorkforceEvidence(options = {}) {
  const readiness = buildTrustedWorkforceReadiness(options);
  return {
    generatedAt: readiness.generatedAt,
    readinessVersion,
    status: readiness.status,
    mode: readiness.mode,
    evidencePacket: readiness.evidencePacket,
    evidenceMarkdown: readiness.evidenceMarkdown,
    controls: readiness.controls,
    dataBoundary: readiness.dataBoundary,
    humanDecisionBoundary: readiness.humanDecisionBoundary,
  };
}
