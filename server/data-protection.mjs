const policyVersion = "sentinelops-data-protection/v1";

const blockedCategories = [
  "classified-marker",
  "cui-marker",
  "ssn",
  "payment-card",
  "private-key",
  "api-secret",
  "bearer-token",
  "patient-record",
  "date-of-birth",
  "biometric-data",
  "foreign-contact-detail",
  "applicant-address-history",
  "adjudicative-detail",
];

const sensitivePatterns = [
  {
    category: "classified-marker",
    label: "classified handling marker",
    severity: "block",
    pattern: /(?:^|\n)\s*(?:TOP SECRET|SECRET|CONFIDENTIAL)(?:\/\/|\s*$)/i,
  },
  {
    category: "cui-marker",
    label: "controlled unclassified information marker",
    severity: "block",
    pattern: /\b(?:CUI\/\/[A-Z0-9/ -]+|CONTROLLED UNCLASSIFIED INFORMATION)\b/i,
  },
  {
    category: "ssn",
    label: "US social security number pattern",
    severity: "block",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/,
  },
  {
    category: "private-key",
    label: "private key material",
    severity: "block",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----/i,
  },
  {
    category: "api-secret",
    label: "API key or secret assignment",
    severity: "block",
    pattern:
      /\b(?:api[_-]?key|secret[_-]?access[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9_\-./+=]{16,}/i,
  },
  {
    category: "bearer-token",
    label: "bearer token",
    severity: "block",
    pattern: /\bBearer\s+[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/i,
  },
  {
    category: "patient-record",
    label: "patient or medical record marker",
    severity: "block",
    pattern: /\b(?:patient\s+(?:name|id)|mrn|medical\s+record)\s*[:#]/i,
  },
  {
    category: "date-of-birth",
    label: "date of birth marker",
    severity: "block",
    pattern: /\b(?:dob|date\s+of\s+birth)\s*[:#]\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/i,
  },
  {
    category: "biometric-data",
    label: "biometric or fingerprint data marker",
    severity: "block",
    pattern: /\b(?:fingerprint|biometric)\s*(?:id|data|template|image)?\s*[:#]/i,
  },
  {
    category: "foreign-contact-detail",
    label: "foreign contact detail marker",
    severity: "block",
    pattern: /\bforeign\s+contact\s*[:#]/i,
  },
  {
    category: "applicant-address-history",
    label: "applicant address history marker",
    severity: "block",
    pattern: /\b(?:address\s+history|places\s+lived)\s*[:#]/i,
  },
  {
    category: "adjudicative-detail",
    label: "adjudicative or clearance issue detail marker",
    severity: "block",
    pattern: /\b(?:adjudicative|clearance)\s+(?:issue|concern|determination)\s*[:#]/i,
  },
];

function luhnValid(value) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function inspectPaymentCard(text) {
  const candidates = text.match(/\b(?:\d[ -]?){13,19}\b/g) || [];
  return candidates.some((candidate) => luhnValid(candidate));
}

function walk(value, path, findings) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    for (const pattern of sensitivePatterns) {
      if (pattern.pattern.test(value)) {
        findings.push({
          category: pattern.category,
          label: pattern.label,
          severity: pattern.severity,
          path,
        });
      }
    }
    if (inspectPaymentCard(value)) {
      findings.push({
        category: "payment-card",
        label: "payment card number pattern",
        severity: "block",
        path,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, findings));
    return;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      walk(nested, nextPath, findings);
    }
  }
}

export function inspectPilotDataBoundary(payload) {
  const findings = [];
  walk(payload, "$", findings);
  return {
    policyVersion,
    mode: process.env.SENTINELOPS_DATA_PROTECTION_MODE || "strict-pilot",
    blockedCategories,
    findingCount: findings.length,
    blocked: findings.length > 0,
    findings,
    disclosure: "Findings include category and field path only. Raw sensitive values are never returned.",
  };
}

export function assertPilotDataBoundary(payload) {
  const report = inspectPilotDataBoundary(payload);
  if (!report.blocked || report.mode === "monitor") {
    return report;
  }
  const error = new Error("Request blocked by SentinelOps pilot data boundary.");
  error.statusCode = 422;
  error.safePayload = {
    error: error.message,
    dataProtection: report,
  };
  throw error;
}

export function buildDataProtectionStatus() {
  return {
    policyVersion,
    mode: process.env.SENTINELOPS_DATA_PROTECTION_MODE || "strict-pilot",
    defaultPilotDataRule: "synthetic, public, or customer-approved non-sensitive data only",
    blockedCategories,
    controls: [
      {
        id: "DP-001",
        name: "Pilot sensitive data block",
        status: "passing",
        description: "Mutating JSON requests are inspected before authorization or persistence.",
      },
      {
        id: "DP-002",
        name: "No raw sensitive echo",
        status: "passing",
        description: "Detection responses include only category and JSON field path.",
      },
      {
        id: "DP-003",
        name: "Portfolio runtime boundary",
        status: "passing",
        description: "Public Vercel deployment remains portfolio-only and fails closed for /api/*.",
      },
      {
        id: "DP-004",
        name: "Human exception process",
        status: "review-required",
        description: "Any sensitive-data exception requires written owner, security, and counsel approval.",
      },
    ],
  };
}
