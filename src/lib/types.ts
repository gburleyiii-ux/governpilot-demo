export type AgentStatus = "complete" | "running" | "queued" | "blocked";
export type GateState = "pending" | "approved" | "denied";
export type Severity = "low" | "medium" | "high" | "critical";
export type EvalStatus = "pass" | "watch" | "fail";
export type EvidenceState = "ready" | "needs-review" | "blocked";
export type ReviewerRoleId = "security-reviewer" | "compliance-analyst" | "auditor" | "operator";
export type RbacPermission =
  | "create_run"
  | "approve_gate"
  | "deny_gate"
  | "run_evals"
  | "run_agent_review"
  | "export_evidence"
  | "route_alerts"
  | "view_settings";

export type ReviewerActor = {
  name: string;
  role: ReviewerRoleId;
};

export type RbacRole = {
  id: ReviewerRoleId;
  label: string;
  description: string;
  permissions: RbacPermission[];
};

export type RbacRolesResponse = {
  defaultActor: ReviewerActor;
  auth: AuthContext;
  roles: RbacRole[];
};

export type AuthContext = {
  mode: "local-dev" | "jwt" | "oidc" | string;
  defaultActor: ReviewerActor;
  jwt: {
    algorithm: string;
    issuerConfigured: boolean;
    audienceConfigured: boolean;
    groupClaims: string[];
    groupRoleMap: Record<string, ReviewerRoleId>;
  };
  oidc: {
    algorithm: string;
    jwksConfigured: boolean;
    jwksHost: string | null;
    jwksCacheMs: number;
    issuerConfigured: boolean;
    audienceConfigured: boolean;
    groupClaims: string[];
    groupRoleMap: Record<string, ReviewerRoleId>;
  };
};

export type AgentStep = {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  time: string;
  traceId: string;
  output: string;
};

export type ApprovalGate = {
  id: string;
  title: string;
  owner: string;
  severity: Severity;
  state: GateState;
  requestedBy: string;
  requestedAt: string;
  reason: string;
  requiredEvidence: string[];
};

export type RiskItem = {
  id: string;
  label: string;
  function: "Govern" | "Map" | "Measure" | "Manage";
  severity: Severity;
  score: number;
  status: string;
  evidence: string;
};

export type EvalMetric = {
  id: string;
  label: string;
  score: number;
  trend: string;
  status: EvalStatus;
  detail: string;
};

export type EvidenceItem = {
  id: string;
  label: string;
  state: EvidenceState;
  owner: string;
};

export type AssessmentRun = {
  id: string;
  title: string;
  environment: string;
  modelGateway: string;
  approvalState: string;
  startedAt: string;
  traceId: string;
  applicant: string;
  cloudTarget: string;
  nistProfile: string;
  summary: string;
  agents: AgentStep[];
  approvalGate: ApprovalGate;
  risks: RiskItem[];
  evals: EvalMetric[];
  evidence: EvidenceItem[];
  events: string[];
};

export type PolicyCheck = {
  id: string;
  policyId: string;
  policyName: string;
  framework: string;
  status: "pass" | "fail";
  recommendation: string;
  checkedAt: string;
  checks: {
    id: string;
    label: string;
    passed: boolean;
    source?: string;
    severity?: Severity | string;
    remediation?: string;
    failedConditions?: number;
  }[];
  runId?: string;
  traceId?: string;
};

export type ApprovalRecord = {
  id: string;
  runId: string;
  gateId: string;
  traceId: string;
  state: GateState;
  reviewer: string;
  reviewerRole: ReviewerRoleId;
  note: string;
  decidedAt: string;
  policyStatus: "pass" | "fail";
  previousHash: string | null;
  signatureMode: string;
  signature: string;
};

export type AgentReview = {
  id: string;
  runId: string;
  traceId: string;
  reviewedAt: string;
  mode: "deterministic-local" | "credential-required" | "openai-agents-sdk";
  recommendation: "controlled-pilot" | "block" | "review-output";
  toolUseDecision: string;
  confidence: number | null;
  summary: string;
  requiredActions: string[];
  riskDeltas: {
    riskId: string;
    from: number | null;
    to: number | null;
    rationale: string;
  }[];
  evalFocus: string[];
  citations: {
    id: string;
    title: string;
    path: string;
    score: number;
    excerpt: string;
    retrieval?: {
      algorithm: string;
      documentCount: number;
      vocabularySize: number;
      matchedTerms: string[];
    };
  }[];
  traceNotes: string[];
};

export type EvalReport = {
  generatedAt: string | null;
  mode: string;
  total: number;
  passed: number;
  failed: number;
  results: {
    id: string;
    description: string;
    setup: string;
    passed: boolean;
    failures: string[];
    review: AgentReview;
  }[];
};

export type ActivePolicy = {
  id: string;
  name: string;
  framework: string;
  decision: string;
  requiredEvidence: string[];
  rules: {
    id: string;
    label: string;
    function: string;
    severity: Severity;
  }[];
};

export type PolicyIntelligenceStatus = {
  service: string;
  version: string;
  generatedAt: string;
  status: "simulated-watch-ready" | "live-watch-ready" | "review-required" | string;
  mode: "deterministic-source-registry" | "live-source-watch" | string;
  autoEnforceNewPolicy: boolean;
  reviewer: {
    configured: boolean;
    owner: string;
    approvalGate: string;
  };
  counts: {
    sources: number;
    authoritativeSources: number;
    reviewItems: number;
    activePolicyRules: number;
    passingControls: number;
    totalControls: number;
  };
  sources: {
    id: string;
    label: string;
    authority: string;
    category: string;
    officialUrl: string;
    machineReadableUrl: string;
    updateCadence: string;
    ownerRole: ReviewerRoleId;
    approvalRequirement: string;
    mappedControlFamilies: string[];
    status: string;
    trustLevel: string;
    provenance: {
      sourceUrlRecorded: boolean;
      contentHashAlgorithm: string;
      snapshotHash: string;
      lastCheckedAt: string;
      evidenceRequired: string[];
    };
  }[];
  reviewQueue: {
    id: string;
    sourceId: string;
    title: string;
    status: string;
    impact: Severity | "critical" | string;
    detectedAt: string;
    reviewerRole: ReviewerRoleId;
    action: string;
  }[];
  activeBundle: {
    id: string;
    name: string;
    framework: string;
    sourceOfTruth: string;
    ruleCount: number;
    activationBoundary: string;
  };
  controls: {
    id: string;
    label: string;
    passed: boolean;
    severity: Severity | "critical" | string;
  }[];
  implementationPlan: string[];
};

export type SystemInfo = {
  service: string;
  version: string;
  storagePath: string;
  storageMode: string;
  storage?: StorageInfo;
  auth?: AuthContext;
  authMode?: string;
  runCount: number;
  approvalCount: number;
  policyCheckCount: number;
  agentReviewCount: number;
  alertDispatchCount: number;
  roleCount: number;
  defaultActor: ReviewerActor;
  openaiConfigured: boolean;
  agentMode: string;
};

export type ModelGatewayStatus = {
  generatedAt: string;
  service: string;
  version: string;
  status: "deterministic-ready" | "live-ready" | "credential-required" | string;
  authMode: string;
  agentMode: string;
  storageMode: string;
  preferredRouteId: string;
  counts: {
    providers: number;
    readyProviders: number;
    configuredLiveProviders: number;
    blockedProviders: number;
    routingRules: number;
    passingControls: number;
    totalControls: number;
  };
  providers: {
    id: string;
    label: string;
    provider: string;
    configured: boolean;
    status: string;
    credentialBoundary: string;
    credentialEnvVars: string[];
    regionPolicy: string;
    dataBoundary: string;
    allowedUse: string[];
    blockedUse: string[];
    maxLatencyMs: number;
    costCeiling: string;
    fallbackPriority: number;
  }[];
  routingPlan: {
    id: string;
    condition: string;
    routeId: string;
    decision: string;
  }[];
  controlChecks: {
    id: string;
    label: string;
    passed: boolean;
    evidence: string;
  }[];
  securityBoundary: string[];
};

export type CostGuardrails = {
  generatedAt: string;
  service: string;
  version: string;
  guardrailVersion: string;
  status: "guarded" | "review-required" | string;
  authMode: string;
  agentMode: string;
  preferredRouteId: string;
  preferredRouteBudget: CostRouteBudget | null;
  policy: {
    policyVersion: string;
    defaultRunBudgetUsd: number;
    dailyPilotBudgetUsd: number;
    monthlyPilotBudgetUsd: number;
    maxPilotRunsPerDay: number;
    maxPromptTokens: number;
    maxCompletionTokens: number;
    maxTotalTokens: number;
    maxP95LatencyMs: number;
  };
  counts: {
    routes: number;
    passingControls: number;
    totalControls: number;
    routesOverBudget: number;
    routesOverLatency: number;
    routesOverTokenLimit: number;
  };
  routeBudgets: CostRouteBudget[];
  controls: {
    id: string;
    label: string;
    passed: boolean;
    evidence: string;
  }[];
  disclosureBoundary: string[];
};

export type CostRouteBudget = {
  routeId: string;
  provider: string;
  label: string;
  configured: boolean;
  routeStatus: string;
  estimatedCostUsd: number;
  maxCostUsd: number;
  costStatus: string;
  estimatedP95LatencyMs: number;
  maxP95LatencyMs: number;
  latencyStatus: string;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  estimatedTotalTokens: number;
  maxTotalTokens: number;
  tokenStatus: string;
  estimatorNote: string;
  disclosureBoundary: string;
};

export type RetrievalReadiness = {
  generatedAt: string;
  service: string;
  version: string;
  readinessVersion: string;
  status: "local-ready" | "vector-ready" | "review-required" | string;
  requestedBackend: string;
  recommendedBackend: string;
  authMode: string;
  agentMode: string;
  storageMode: string;
  corpus: {
    documentCount: number;
    vocabularySize: number;
    algorithm: string;
    sourceGlob: string;
    documents: {
      id: string;
      title: string;
      path: string;
    }[];
  };
  counts: {
    backends: number;
    configuredBackends: number;
    passingControls: number;
    totalControls: number;
    probeQueries: number;
  };
  backends: {
    id: string;
    label: string;
    status: string;
    configured: boolean;
    algorithm: string;
    credentialBoundary: string;
    storageBoundary: string;
    allowedUse: string[];
    blockedUse: string[];
  }[];
  controls: {
    id: string;
    label: string;
    passed: boolean;
    evidence: string;
  }[];
  probeResults: {
    id: string;
    topCitationId: string | null;
    topCitationTitle: string | null;
    score: number;
    matchedTerms: string[];
  }[];
  migration: {
    table: string;
    extension: string;
    index: string;
    sql: string;
  };
  disclosureBoundary: string[];
};

export type TrustedWorkforceReadiness = {
  service: string;
  version: string;
  generatedAt: string;
  readinessVersion: string;
  status: "synthetic-ready" | "connector-review-ready" | "review-required" | string;
  mode: "synthetic-readiness" | "customer-authorized-connector-review" | string;
  authMode: string;
  agentMode: string;
  storageMode: string;
  autoAdjudication: boolean;
  liveNbisIntegration: {
    requested: boolean;
    authorized: boolean;
    accountBoundaryApproved: boolean;
    ownerConfigured: boolean;
    owner: string;
    boundary: string;
  };
  counts: {
    sources: number;
    authoritativeSources: number;
    lifecycleStages: number;
    procedures: number;
    workInstructions: number;
    blockedDataCategories: number;
    passingControls: number;
    totalControls: number;
  };
  sources: {
    id: string;
    label: string;
    authority: string;
    category: string;
    officialUrl: string;
    updateCadence: string;
    ownerRole: string;
    approvalRequirement: string;
    mappedConcepts: string[];
    status: string;
    trustLevel: string;
    provenance: {
      sourceUrlRecorded: boolean;
      contentHashAlgorithm: string;
      snapshotHash: string;
      lastCheckedAt: string;
      evidenceRequired: string[];
    };
  }[];
  lifecycle: {
    id: string;
    label: string;
    title: string;
    ownerRole: string;
    status: string;
    policySourceIds: string[];
    requiredEvidence: string[];
    aiBoundary: string;
  }[];
  procedures: {
    id: string;
    title: string;
    processStageId: string;
    ownerRole: string;
    status: string;
    policySourceIds: string[];
    requiredEvidence: string[];
    blockedDataCategories: string[];
    workInstructionIds: string[];
  }[];
  workInstructions: {
    id: string;
    procedureId: string;
    title: string;
    ownerRole: string;
    instruction: string;
    evidenceRequired: string[];
    forbiddenInputs: string[];
    completionGate: string;
  }[];
  controls: {
    id: string;
    label: string;
    passed: boolean;
    severity: Severity | string;
    evidence: string;
  }[];
  dataBoundary: string[];
  humanDecisionBoundary: string[];
  evidencePacket: {
    id: string;
    generatedAt: string;
    scope: string;
    ownerBoundary: string;
    sourceCount: number;
    lifecycleStageCount: number;
    procedureCount: number;
    workInstructionCount: number;
    blockedDataCategories: string[];
    controls: {
      id: string;
      passed: boolean;
      evidence: string;
    }[];
    evidenceSha256: string;
  };
  evidenceMarkdown: string;
  implementationPlan: string[];
};

export type RegoCompatibility = {
  generatedAt: string;
  compatibilityVersion: string;
  sourcePolicyId: string;
  sourcePolicyName: string;
  framework: string;
  status: "compatible" | "unsupported-conditions" | string;
  packageRoot: string;
  supportedOperators: string[];
  counts: {
    rules: number;
    runtimeRules: number;
    infrastructureRules: number;
    modules: number;
    supportedConditions: number;
    unsupportedConditions: number;
  };
  ruleMappings: {
    id: string;
    domain: string;
    label: string;
    severity: Severity | string;
    supported: boolean;
    conditions: {
      source: string;
      path: string;
      operator: string;
      supported: boolean;
      expression: string;
    }[];
  }[];
  modules: {
    packageName: string;
    domain: string;
    path: string;
    rego: string;
    ruleCount: number;
  }[];
  unsupportedConditions: {
    ruleId: string;
    operator: string;
    source: string;
    path: string;
  }[];
  usage: {
    inputShape: Record<string, string>;
    command: string;
    boundary: string;
  };
};

export type ObservabilitySummary = {
  generatedAt: string;
  service: string;
  version: string;
  agentMode: string;
  storageMode: string;
  authMode: string;
  latestRunId: string | null;
  counts: {
    runs: number;
    approvals: number;
    policyChecks: number;
    agentReviews: number;
    alertDispatches: number;
    auditEvents: number;
  };
  slos: {
    id: string;
    label: string;
    actual: string;
    target: string;
    status: "pass" | "fail" | string;
    detail: string;
  }[];
  alerts: {
    id: string;
    severity: "critical" | "high" | "medium" | "info" | string;
    title: string;
    detail: string;
  }[];
  signals: {
    approvalLedger: {
      passed: boolean;
      total: number;
      validSignatures: number;
      validChainLinks: number;
    };
    latestPolicyCheck: {
      status: "pass" | "fail" | string;
      passedChecks: number;
      totalChecks: number;
    } | null;
    evalReport: {
      generatedAt: string | null;
      total: number;
      passed: number;
      failed: number;
    } | null;
    retrieval: {
      latestCitationCount: number;
      citationMetadataCount: number;
      algorithms: string[];
    };
  };
  recentEvents: {
    id: string;
    at: string;
    runId: string;
    event: string;
  }[];
};

export type AlertRoute = {
  id: string;
  label: string;
  target: "email" | "slack" | "siem" | string;
  destination: string;
  severities: string[];
  deliveryMode: string;
  enabled: boolean;
};

export type AlertDispatch = {
  id: string;
  routedAt: string;
  alertId: string;
  alertTitle: string;
  alertSeverity: string;
  runId: string | null;
  routeId: string;
  routeLabel: string;
  target: string;
  destination: string;
  deliveryMode: string;
  deliveryStatus: string;
  actorName: string;
  actorRole: ReviewerRoleId | string;
  signingMode: string;
  summaryHash: string;
  previousHash: string | null;
  signature: string;
  siemEvent?: Record<string, unknown>;
};

export type AlertRoutingStatus = {
  routes: AlertRoute[];
  dispatches: AlertDispatch[];
  ledger: {
    total: number;
    validSignatures: number;
    validChainLinks: number;
    passed: boolean;
  };
};

export type AlertDispatchResponse = AlertRoutingStatus & {
  summary: ObservabilitySummary;
  siemEvents: Record<string, unknown>[];
};

export type LiveDeliveryReadiness = {
  generatedAt: string;
  service: string;
  version: string;
  readinessVersion: string;
  status: "simulated-ready" | "live-ready" | "review-required" | string;
  mode: string;
  liveRequested: boolean;
  liveApproved: boolean;
  authMode: string;
  agentMode: string;
  storageMode: string;
  counts: {
    providers: number;
    configuredProviders: number;
    requestedProviders: number;
    readyRequestedProviders: number;
    simulatedRoutes: number;
    passingControls: number;
    totalControls: number;
  };
  routes: {
    id: string;
    label: string;
    target: string;
    deliveryMode: string;
    severities: string[];
    enabled: boolean;
  }[];
  providers: {
    id: string;
    label: string;
    target: string;
    requestedForLive: boolean;
    configured: boolean;
    status: "ready" | "config-required" | "not-configured" | string;
    requiredEnvVars: string[];
    requiredAnyEnvVars: string[];
    optionalEnvVars: string[];
    configuredEnvVars: string[];
    destinationSummary: string;
    credentialBoundary: string;
    payloadContract: string;
  }[];
  controls: {
    id: string;
    label: string;
    passed: boolean;
    evidence: string;
  }[];
  payloadContracts: {
    id: string;
    fields: string[];
    boundary: string;
  }[];
  disclosureBoundary: string[];
};

export type StorageInfo = {
  path: string;
  mode: "local-json" | "aws-s3-dynamodb" | string;
  bucket?: string;
  stateKey?: string;
  evidencePrefix?: string;
  approvalLedgerTable?: string;
  region?: string;
};

export type FullAuditExport = {
  exportVersion: string;
  generatedAt: string;
  service: string;
  serviceVersion: string;
  scope: string;
  authMode: string;
  agentMode: string;
  storage: StorageInfo | null;
  counts: {
    runs: number;
    approvals: number;
    policyChecks: number;
    agentReviews: number;
    auditEvents: number;
    alertDispatches: number;
  };
  integrity: {
    approvalLedger: {
      total: number;
      validSignatures: number;
      validChainLinks: number;
      passed: boolean;
      checks: Record<string, unknown>[];
    };
    datasetHashes: {
      label: string;
      count: number;
      sha256: string;
    }[];
  };
  retentionGuidance: {
    dataBoundary: string;
    secretPolicy: string;
    recommendedControls: string[];
  };
  runs: {
    runId: string;
    traceId: string;
    title: string;
    approvalState: string;
    startedAt: string;
    counts: {
      approvals: number;
      policyChecks: number;
      agentReviews: number;
      auditEvents: number;
    };
    latestApprovalSignature: string | null;
    latestPolicyStatus: string | null;
    latestAgentRecommendation: string | null;
    evidenceManifestSha256: string | null;
    evidencePacketSha256: string | null;
    evidencePacketBytes: number;
    auditCompleteness: {
      hasApproval: boolean;
      hasPolicyCheck: boolean;
      hasAgentReview: boolean;
      hasAuditEvents: boolean;
    };
  }[];
  exportSha256: string;
};

export type ApiRunResponse = {
  run: AssessmentRun;
  approvals: ApprovalRecord[];
  policyChecks: PolicyCheck[];
  agentReviews: AgentReview[];
  latestPolicyCheck: PolicyCheck | null;
  latestApproval: ApprovalRecord | null;
  latestAgentReview: AgentReview | null;
  storage: StorageInfo;
};
