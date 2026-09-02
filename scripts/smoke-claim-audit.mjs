// Gauge H2 claim-audit CI/ship gate.
// Fails on FedRAMP/CMMC/DISA/customer/BA overclaim regression in buyer-facing surfaces.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const BUYER_GLOBS = [
  "src/App.tsx",
  "src/data/seed.ts",
  "src/lib/sentinelEngine.ts",
  "server/seed.mjs",
  "server/policies/policy-as-code.json",
  "server/policy-intelligence.mjs",
  "data/sentinelops-state.json",
  "README.md",
  "CURATION_NOTE.md",
  "index.html",
];

function walkDocs(dir, out = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkDocs(p, out);
    else if (/\.(md|tsx?|jsx?|mjs|json|html)$/.test(name)) out.push(p);
  }
  return out;
}

const files = [
  ...BUYER_GLOBS.map((p) => join(root, p)),
  ...walkDocs(join(root, "docs")),
].filter((p) => {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
});

const RULES = [
  {
    id: "FR-AUTH",
    re: /FedRAMP\s+High/i,
    allow: /(maps-toward|not authorized|readiness)/i,
    note: "FedRAMP High without maps-toward / not authorized / readiness qualifier",
  },
  {
    id: "FR-AUTHZ",
    re: /FedRAMP[^\n]{0,40}\b(authorized|authorization|ATO)\b/i,
    allow: /not\s+yet\s+a\s+FedRAMP|not\s+(FedRAMP[- ])?authorized|does\s+not\s+claim\s+FedRAMP|FedRAMP authorization\s+are\s+separate|Independently assessed against a FedRAMP|no\s+ATO|without\s+an?\s+ATO|maps-toward|self-asserted|not\s+an\s+authorization|not authorized|external steps|truthful boundary/i,
    note: "FedRAMP authorized/ATO claim without negation",
  },
  {
    id: "FR-BARE-CHIP",
    re: /["']FedRAMP["']/,
    note: 'Bare "FedRAMP" chip/label — require maps-toward / readiness in the string',
  },
  {
    id: "CMMC-BARE",
    re: /["']CMMC["']/,
    note: 'Bare "CMMC" chip/label — require maps-toward / readiness in the string',
  },
  {
    id: "CMMC-CERT",
    re: /CMMC[^\n]{0,40}\b(certified|certification|Level\s*[123]\s+certified)\b/i,
    allow: /not\s+yet\s+a\s+FedRAMP|not\s+CMMC|maps-toward|readiness|not\s+certified|not yet a .*CMMC|CMMC-certified, agency-approved/i,
    note: "CMMC certified claim without negation",
  },
  {
    id: "FR-PILOT-CTRL",
    re: /FedRAMP\s+pilot\s+controls/i,
    allow: /not authorized|readiness|maps-toward/i,
    note: '"FedRAMP pilot controls" without readiness/not-authorized qualifier',
  },
  {
    id: "BA-ACTS",
    re: /acts as a HIPAA Business Associate/i,
    note: "BA status overclaim — require BA-ready / BAA not executed",
  },
  {
    id: "BA-TITLE",
    re: /HIPAA Business Associate/i,
    allow: /(BA-ready|BAA not|maps-toward|not executed|not legal)/i,
    note: "HIPAA Business Associate without BA-ready / BAA-not qualifier",
  },
  {
    id: "BA-AS",
    re: /HIPAA as BA/i,
    allow: /(BA-ready|BAA not|maps-toward)/i,
    note: '"HIPAA as BA" without BA-ready / maps-toward qualifier',
  },
  {
    id: "DISA-STIG",
    re: /\bDISA\b[^\n]{0,80}\bSTIG\b/i,
    allow: /(watchlist|not STIGed|not ATO|maps-toward|disa-stig-library)/i,
    note: "DISA STIG without watchlist / not STIGed qualifier",
  },
  {
    id: "CUSTOMER-ARR",
    re: /\b([1-9]\d*)\s+(paying\s+)?customers\b|\bARR\b\s*[:=]?\s*\$|\b\$\d+(\.\d+)?\s*(M|B)?\s*(ARR|MRR)\b/i,
    allow: /zero customers|0 customers|no customers|not revenue|list prices|targets,? not revenue|Demo estimate/i,
    note: "Customer count / ARR revenue claim",
  },
];

const failures = [];

for (const file of files) {
  const rel = relative(root, file);
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      if (!rule.re.test(line)) continue;
      if (rule.allow && rule.allow.test(line)) continue;
      failures.push({
        id: rule.id,
        file: rel,
        line: i + 1,
        note: rule.note,
        text: line.trim().slice(0, 200),
      });
    }
  }
}

{
  const indexPath = join(root, "server/index.mjs");
  const src = readFileSync(indexPath, "utf8");
  const m = src.match(/async function getLatestRun\(\)[\s\S]*?\n\}/);
  if (!m) {
    failures.push({ id: "H11", file: "server/index.mjs", line: 0, note: "getLatestRun() missing", text: "" });
  } else if (/createAssessmentRun|updateState|ensureLatestRun/.test(m[0])) {
    failures.push({
      id: "H11",
      file: "server/index.mjs",
      line: 0,
      note: "getLatestRun must stay read-only (no createAssessmentRun/updateState)",
      text: m[0].slice(0, 160),
    });
  } else {
    console.log("PASS — H11 getLatestRun read-only");
  }
}

{
  const indexPath = join(root, "server/index.mjs");
  const src = readFileSync(indexPath, "utf8");
  const m = src.match(
    /const auditMatch = pathname\.match[\s\S]*?if \(req\.method === "GET" && auditMatch\) \{[\s\S]*?\n    \}/,
  );
  if (!m) {
    failures.push({
      id: "H12",
      file: "server/index.mjs",
      line: 0,
      note: "GET /api/runs/:id/audit handler missing",
      text: "",
    });
  } else if (!/resolveRequestActor/.test(m[0]) || !/exportEvidence/.test(m[0])) {
    failures.push({
      id: "H12",
      file: "server/index.mjs",
      line: 0,
      note: "audit route must call resolveRequestActor + permissions.exportEvidence",
      text: m[0].slice(0, 200),
    });
  } else {
    console.log("PASS — H12 audit route authz (actor + export_evidence)");
  }
}

if (failures.length) {
  console.error("claim-audit: FAIL — " + failures.length + " overclaim(s)");
  for (const f of failures) {
    console.error(`  [${f.id}] ${f.file}:${f.line} — ${f.note}`);
    if (f.text) console.error(`    ${f.text}`);
  }
  process.exit(1);
}
console.log(
  "claim-audit: PASS — no FedRAMP/CMMC/DISA/customer/BA overclaim regressions; H11/H12 static OK",
);
