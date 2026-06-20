// GAGS -> compliance evidence generator (Phase P3 wedge).
//
// Turns the conformance map + signed conformance report + crosswalk into the
// paperwork buyers already owe: SSP control-implementation statements, a POA&M,
// and a continuous-monitoring plan. Conforming to GAGS *produces* the
// FedRAMP/NIST RMF artifacts instead of requiring them to be written by hand.
//
// Honest boundary: these are GENERATED DRAFTS from self-asserted conformance.
// They are inputs to an SSP/assessment, not an authorization. Independent
// assessment (3PAO) and an authorizing official are separate, external steps.

// Invert the crosswalk: for each NIST 800-53 control referenced by any GAGS
// requirement, collect the requirements that implement it with their live status.
export function buildControlImplementations(map, report, crosswalk) {
  const statusById = new Map(report.requirements.map((r) => [r.id, r.status]));
  const titleById = new Map(map.requirements.map((r) => [r.id, r.title]));
  const checkById = new Map(
    map.requirements.map((r) => [r.id, (r.checks || []).map((c) => c.script || c.check || c.type).join(", ")]),
  );

  const byControl = new Map(); // control -> { control, requirements: [] }
  for (const [reqId, mapping] of Object.entries(crosswalk.mappings || {})) {
    const controls = mapping.nist_800_53 || [];
    for (const control of controls) {
      if (!byControl.has(control)) byControl.set(control, { control, framework: "NIST SP 800-53 Rev5", requirements: [] });
      byControl.get(control).requirements.push({
        id: reqId,
        title: titleById.get(reqId) || reqId,
        status: statusById.get(reqId) || "Unknown",
        verification: checkById.get(reqId) || "n/a",
      });
    }
  }

  return [...byControl.values()]
    .sort((a, b) => (a.control < b.control ? -1 : 1))
    .map((entry) => ({
      ...entry,
      implemented: entry.requirements.every((r) => r.status === "Pass"),
      partiallyImplemented: entry.requirements.some((r) => r.status === "Pass") && !entry.requirements.every((r) => r.status === "Pass"),
    }));
}

// POA&M: data-driven open findings (any requirement not Pass) plus the explicit,
// honestly-stated authorization gaps that require external parties / owner spend.
export function buildPoam(report, knownGaps = []) {
  let seq = 0;
  const findings = report.requirements
    .filter((r) => r.status !== "Pass")
    .map((r) => ({
      id: `POAM-${String(++seq).padStart(3, "0")}`,
      source: "conformance",
      item: `${r.id} — ${r.title}`,
      status: r.status,
      weakness: r.status === "Roadmap" ? "Requirement is roadmap; control not yet implemented." : "Conformance check failing.",
      remediation: "Implement and pass the mapped conformance check.",
      external: false,
    }));
  const gaps = knownGaps.map((g) => ({
    id: `POAM-${String(++seq).padStart(3, "0")}`,
    source: "authorization-readiness",
    item: g.item,
    status: "Open",
    weakness: g.weakness,
    remediation: g.remediation,
    external: g.external === true,
  }));
  return { generatedFrom: "conformance report + program plan", openConformanceFindings: findings.length, entries: [...findings, ...gaps] };
}

// Continuous-monitoring plan: every conformance check becomes a monitored
// control with a cadence. The conformance suite IS the con-mon instrument.
export function buildContinuousMonitoringPlan(map) {
  const items = map.requirements.map((r) => ({
    id: r.id,
    title: r.title,
    level: r.level,
    must: Boolean(r.must),
    monitor: (r.checks || []).map((c) => c.script || c.check || c.type),
    cadence: r.must ? "every CI run + every release (build-gating)" : "every CI run (reported, non-gating)",
  }));
  return {
    instrument: "GAGS conformance suite (npm run conformance) + GAGS TCK",
    automated: true,
    gating: "L1 MUST failures block merge via .github/workflows (GAGS SC-1).",
    items,
  };
}

// Default authorization-readiness gaps (external / owner-gated). Stated plainly
// per the GAGS honesty principle — these are NOT things the vendor can self-close.
export const DEFAULT_AUTHORIZATION_GAPS = [
  { item: "Independent assessment (3PAO)", weakness: "Conformance is self-asserted; no independent assessment performed.", remediation: "Engage an accredited 3PAO to assess the system.", external: true },
  { item: "Sponsoring agency / authorizing official", weakness: "No agency sponsor or ATO; FedRAMP requires an agency sponsor or the PMO path.", remediation: "Secure an agency sponsor and authorizing official.", external: true },
  { item: "L2 against live infrastructure", weakness: "L2 controls demonstrated against a local backend; persistence/IdP/live delivery not proven on deployed infrastructure.", remediation: "Deploy backend + managed datastore + agency IdP; prove one live external delivery.", external: false },
  { item: "Neutral standard steward", weakness: "GAGS is governed by the vendor; no neutral steward or public conformance registry yet.", remediation: "Engage NIST/GSA/an SDO; stand up a neutral governance body + registry.", external: true },
];

function mdTable(headers, rows) {
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

export function renderSspMarkdown(controls, meta) {
  const lines = [
    "# GAGS-Generated SSP Control-Implementation Statements",
    "",
    `Standard: ${meta.standard} ${meta.version} · Generated from \`standard/crosswalk.json\` + \`standard/conformance-report.json\`.`,
    "",
    "> **Draft, self-asserted.** Each statement is generated from the GAGS conformance",
    "> evidence. It is an input to a System Security Plan, not an authorization. Independent",
    "> assessment is a separate step.",
    "",
    `Controls covered: **${controls.length}** (NIST SP 800-53 Rev5).`,
    "",
  ];
  for (const c of controls) {
    const state = c.implemented ? "Implemented" : c.partiallyImplemented ? "Partially Implemented" : "Planned";
    lines.push(`## ${c.control} — ${state}`);
    lines.push("");
    lines.push("Implemented by GAGS requirements:");
    lines.push("");
    lines.push(
      mdTable(
        ["GAGS", "Requirement", "Status", "Verification"],
        c.requirements.map((r) => [r.id, r.title.replace(/\|/g, "\\|"), r.status, `\`${r.verification}\``]),
      ),
    );
    lines.push("");
  }
  return lines.join("\n");
}

export function renderPoamMarkdown(poam, meta) {
  return [
    "# GAGS-Generated POA&M (Plan of Action & Milestones)",
    "",
    `Standard: ${meta.standard} ${meta.version}. Open conformance findings: **${poam.openConformanceFindings}**.`,
    "",
    "> Data-driven from the conformance report plus the honestly-stated authorization",
    "> gaps that require external parties or owner spend (marked *external*).",
    "",
    mdTable(
      ["ID", "Source", "Item", "Status", "Weakness", "Remediation", "External"],
      poam.entries.map((e) => [e.id, e.source, e.item.replace(/\|/g, "\\|"), e.status, e.weakness.replace(/\|/g, "\\|"), e.remediation.replace(/\|/g, "\\|"), e.external ? "yes" : "no"]),
    ),
    "",
  ].join("\n");
}

export function renderConMonMarkdown(plan, meta) {
  return [
    "# GAGS-Generated Continuous-Monitoring Plan",
    "",
    `Standard: ${meta.standard} ${meta.version}.`,
    "",
    `Instrument: \`${plan.instrument}\`. Automated: ${plan.automated}. ${plan.gating}`,
    "",
    mdTable(
      ["GAGS", "Requirement", "Level", "Monitor (check)", "Cadence"],
      plan.items.map((i) => [i.id, i.title.replace(/\|/g, "\\|"), `${i.level}${i.must ? " MUST" : ""}`, `\`${i.monitor.join(", ")}\``, i.cadence]),
    ),
    "",
  ].join("\n");
}
