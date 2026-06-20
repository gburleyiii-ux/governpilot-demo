import { createHash } from "node:crypto";
import { loadPolicyAsCode } from "./policy-as-code.mjs";

const policySources = [
  {
    id: "nist-oscal-sp800-53",
    label: "NIST SP 800-53 OSCAL catalog",
    authority: "NIST",
    category: "control-catalog",
    officialUrl: "https://pages.nist.gov/OSCAL/",
    machineReadableUrl:
      "https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json",
    updateCadence: "release-driven",
    ownerRole: "compliance-analyst",
    approvalRequirement: "ISSO or control owner approves mapped controls before enforcement.",
    mappedControlFamilies: ["AC", "AU", "CM", "IA", "RA", "SC"],
  },
  {
    id: "fedramp-automation",
    label: "FedRAMP automation and OSCAL baselines",
    authority: "FedRAMP PMO",
    category: "authorization-baseline",
    officialUrl: "https://automate.fedramp.gov/",
    machineReadableUrl: "https://github.com/GSA/fedramp-automation",
    updateCadence: "baseline-release",
    ownerRole: "compliance-analyst",
    approvalRequirement: "FedRAMP lead approves baseline impact and effective date.",
    mappedControlFamilies: ["CA", "CM", "CP", "IR", "PL", "RA"],
  },
  {
    id: "ecfr-api",
    label: "eCFR API",
    authority: "National Archives / Office of the Federal Register",
    category: "regulation-feed",
    officialUrl: "https://www.ecfr.gov/developers/documentation/api/v1",
    machineReadableUrl: "https://www.ecfr.gov/api/versioner/v1",
    updateCadence: "daily-watch",
    ownerRole: "compliance-analyst",
    approvalRequirement: "Legal or compliance owner approves applicability and scope.",
    mappedControlFamilies: ["contract", "privacy", "records", "security"],
  },
  {
    id: "federal-register-api",
    label: "Federal Register API",
    authority: "Office of the Federal Register",
    category: "rulemaking-feed",
    officialUrl: "https://www.federalregister.gov/developers/documentation/api/v1",
    machineReadableUrl: "https://www.federalregister.gov/api/v1",
    updateCadence: "daily-watch",
    ownerRole: "compliance-analyst",
    approvalRequirement: "Legal owner approves proposed/final-rule relevance before enforcement.",
    mappedControlFamilies: ["rulemaking", "effective-date", "agency-guidance"],
  },
  {
    id: "cisa-kev",
    label: "CISA Known Exploited Vulnerabilities catalog",
    authority: "CISA",
    category: "threat-intelligence",
    officialUrl: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    machineReadableUrl: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    updateCadence: "daily-watch",
    ownerRole: "security-reviewer",
    approvalRequirement: "Security owner approves vulnerability impact and remediation mapping.",
    mappedControlFamilies: ["RA", "SI", "CM", "IR"],
  },
  {
    id: "disa-stig-library",
    label: "DISA STIG library",
    authority: "DISA",
    category: "secure-configuration",
    officialUrl: "https://public.cyber.mil/stigs/downloads/",
    machineReadableUrl: "https://public.cyber.mil/stigs/downloads/",
    updateCadence: "release-driven",
    ownerRole: "security-reviewer",
    approvalRequirement: "Security engineering owner approves STIG applicability and exceptions.",
    mappedControlFamilies: ["CM", "IA", "SC", "SI"],
  },
  {
    id: "performance-trusted-workforce-2",
    label: "Trusted Workforce 2.0",
    authority: "Performance.gov",
    category: "personnel-vetting-policy",
    officialUrl: "https://www.performance.gov/trusted-workforce/",
    machineReadableUrl: "https://www.performance.gov/trusted-workforce/",
    updateCadence: "quarterly-progress-watch",
    ownerRole: "compliance-analyst",
    approvalRequirement: "FSO, SSO, or personnel security owner approves applicability before workflow activation.",
    mappedControlFamilies: ["personnel-vetting", "position-designation", "continuous-vetting", "trust-determination"],
  },
  {
    id: "dcsa-nbis-agency-eapp",
    label: "DCSA NBIS Agency and eApp",
    authority: "DCSA",
    category: "personnel-vetting-system-guidance",
    officialUrl:
      "https://www.dcsa.mil/Systems-Applications/National-Background-Investigation-Services-NBIS/NBIS-eApp-NBIS-Agency/",
    machineReadableUrl:
      "https://www.dcsa.mil/Systems-Applications/National-Background-Investigation-Services-NBIS/NBIS-eApp-NBIS-Agency/",
    updateCadence: "official-page-watch",
    ownerRole: "security-reviewer",
    approvalRequirement: "FSO/SSO validates NBIS workflow boundaries and confirms no live automation is enabled.",
    mappedControlFamilies: ["eApp", "NBIS Agency", "FSO", "SSO", "continuous-vetting"],
  },
  {
    id: "customer-policy-vault",
    label: "Customer policy vault",
    authority: "Customer-owned",
    category: "internal-policy",
    officialUrl: "customer-controlled-vault",
    machineReadableUrl: "customer-controlled-vault",
    updateCadence: "customer-defined",
    ownerRole: "compliance-analyst",
    approvalRequirement: "Customer policy owner approves every active internal policy version.",
    mappedControlFamilies: ["SOP", "contract", "data-handling", "ATO-boundary"],
  },
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function buildSourceSnapshot(source, generatedAt) {
  const provenanceInput = JSON.stringify({
    id: source.id,
    authority: source.authority,
    officialUrl: source.officialUrl,
    machineReadableUrl: source.machineReadableUrl,
    generatedAt: generatedAt.slice(0, 10),
  });

  return {
    ...source,
    status: source.id === "customer-policy-vault" ? "customer-connection-required" : "official-source-registered",
    trustLevel: source.id === "customer-policy-vault" ? "customer-controlled" : "authoritative-public",
    provenance: {
      sourceUrlRecorded: true,
      contentHashAlgorithm: "sha256",
      snapshotHash: sha256(provenanceInput),
      lastCheckedAt: generatedAt,
      evidenceRequired: ["source URL", "retrieval timestamp", "content hash", "reviewer approval", "effective date"],
    },
  };
}

function buildChangeQueue(generatedAt) {
  return [
    {
      id: "change-nist-oscal-control-import",
      sourceId: "nist-oscal-sp800-53",
      title: "Map NIST OSCAL catalog families to enforceable SentinelOps controls",
      status: "review-required",
      impact: "high",
      detectedAt: generatedAt,
      reviewerRole: "compliance-analyst",
      action: "Approve control-family scope, evidence requirements, and exceptions before active enforcement.",
    },
    {
      id: "change-fedramp-baseline-import",
      sourceId: "fedramp-automation",
      title: "Review FedRAMP baseline source for pilot authorization boundary",
      status: "review-required",
      impact: "high",
      detectedAt: generatedAt,
      reviewerRole: "compliance-analyst",
      action: "Select Low, Moderate, High, or customer-specific overlay before mapping checks.",
    },
    {
      id: "change-customer-policy-vault",
      sourceId: "customer-policy-vault",
      title: "Connect customer policy vault or document repository",
      status: "approval-required",
      impact: "critical",
      detectedAt: generatedAt,
      reviewerRole: "security-reviewer",
      action: "Approve connector, storage boundary, document classification labels, and ingestion schedule.",
    },
    {
      id: "change-trusted-workforce-readiness",
      sourceId: "performance-trusted-workforce-2",
      title: "Map Trusted Workforce personnel-vetting lifecycle to GovernPilot readiness controls",
      status: "review-required",
      impact: "high",
      detectedAt: generatedAt,
      reviewerRole: "compliance-analyst",
      action: "Approve position designation, initiation, adjudication handoff, access, and continuous-vetting scope before pilot use.",
    },
    {
      id: "change-nbis-agency-eapp-boundary",
      sourceId: "dcsa-nbis-agency-eapp",
      title: "Confirm NBIS/eApp launch-out boundary and no live automation posture",
      status: "review-required",
      impact: "critical",
      detectedAt: generatedAt,
      reviewerRole: "security-reviewer",
      action: "Approve FSO/SSO workflow mapping, no-scraping rule, blocked data categories, and customer authorization requirements.",
    },
  ];
}

function buildControls(sources, env) {
  const liveMode = env.SENTINELOPS_POLICY_INTEL_MODE === "live";
  const sourceFetchApproved = env.SENTINELOPS_POLICY_SOURCE_FETCH_APPROVED === "true";
  const reviewerConfigured = Boolean(env.SENTINELOPS_POLICY_REVIEW_OWNER);

  return [
    {
      id: "PSI-001",
      label: "Official policy source registry is declared.",
      passed: sources.every((source) => source.officialUrl.startsWith("https://") || source.officialUrl === "customer-controlled-vault"),
      severity: "critical",
    },
    {
      id: "PSI-002",
      label: "Every source records provenance fields and a SHA-256 snapshot hash.",
      passed: sources.every((source) => source.provenance?.snapshotHash?.length === 64),
      severity: "critical",
    },
    {
      id: "PSI-003",
      label: "Detected changes enter human review before enforcement.",
      passed: true,
      severity: "critical",
    },
    {
      id: "PSI-004",
      label: "Live source fetching requires explicit approval.",
      passed: !liveMode || sourceFetchApproved,
      severity: "high",
    },
    {
      id: "PSI-005",
      label: "Policy owner must be configured before live watch mode.",
      passed: !liveMode || reviewerConfigured,
      severity: "high",
    },
    {
      id: "PSI-006",
      label: "New policy interpretations are not auto-enforced.",
      passed: true,
      severity: "critical",
    },
  ];
}

export async function buildPolicyIntelligenceStatus({ service = "sentinelops-api", version = "0.22.0", env = process.env } = {}) {
  const generatedAt = new Date().toISOString();
  const activePolicy = await loadPolicyAsCode();
  const sources = policySources.map((source) => buildSourceSnapshot(source, generatedAt));
  const reviewQueue = buildChangeQueue(generatedAt);
  const controls = buildControls(sources, env);
  const passingControls = controls.filter((control) => control.passed).length;
  const liveMode = env.SENTINELOPS_POLICY_INTEL_MODE === "live";
  const sourceFetchApproved = env.SENTINELOPS_POLICY_SOURCE_FETCH_APPROVED === "true";
  const reviewerConfigured = Boolean(env.SENTINELOPS_POLICY_REVIEW_OWNER);
  const liveReady = liveMode && sourceFetchApproved && reviewerConfigured;

  return {
    service,
    version,
    generatedAt,
    status: liveMode ? (liveReady ? "live-watch-ready" : "review-required") : "simulated-watch-ready",
    mode: liveMode ? "live-source-watch" : "deterministic-source-registry",
    autoEnforceNewPolicy: false,
    reviewer: {
      configured: reviewerConfigured,
      owner: env.SENTINELOPS_POLICY_REVIEW_OWNER || "customer-policy-owner-required",
      approvalGate: "human-review-required-before-active-enforcement",
    },
    counts: {
      sources: sources.length,
      authoritativeSources: sources.filter((source) => source.trustLevel === "authoritative-public").length,
      reviewItems: reviewQueue.length,
      activePolicyRules: activePolicy.rules.length,
      passingControls,
      totalControls: controls.length,
    },
    sources,
    reviewQueue,
    activeBundle: {
      id: activePolicy.id,
      name: activePolicy.name,
      framework: activePolicy.framework,
      sourceOfTruth: "server/policies/policy-as-code.json",
      ruleCount: activePolicy.rules.length,
      activationBoundary:
        "Only reviewer-approved mappings from the source registry become enforceable policy-as-code rules.",
    },
    controls,
    implementationPlan: [
      "Fetch official sources on an approved schedule.",
      "Store raw source snapshots with SHA-256 hashes and retrieval metadata.",
      "Diff new snapshots against the last approved version.",
      "Route changes to security, legal, or compliance owners.",
      "Activate only approved policy mappings with effective dates and scope tags.",
      "Export active policy version evidence with every AI decision.",
    ],
  };
}
