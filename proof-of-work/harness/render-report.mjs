// Write REPORT.md from results.json so every quoted number comes from that file.
import { readFileSync, writeFileSync } from "node:fs";

const results = JSON.parse(readFileSync(new URL("../results.json", import.meta.url), "utf8"));
const html = readFileSync(new URL("../demo.html", import.meta.url), "utf8");
const timing = results.timing;
if (!timing?.measurement) {
  throw new Error("results.json is missing timing.measurement");
}
const embeddedMatch = html.match(/<script type="application\/json" id="pow-results">\s*([\s\S]*?)\s*<\/script>/);
if (!embeddedMatch) {
  throw new Error("demo.html is missing embedded results");
}
const embedded = JSON.parse(embeddedMatch[1]);
if (embedded.demo?.volume?.buildMs !== timing.buildMs || embedded.demo?.volume?.verifyMs !== timing.verifyMs) {
  throw new Error("demo.html timings do not match results.json timing");
}
if (embedded.timing?.buildMs !== timing.buildMs || embedded.timing?.verifyMs !== timing.verifyMs) {
  throw new Error("demo.html embedded timing block does not match results.json");
}

const { all, existingSuite, adversarial } = results.summary;
const m = timing.measurement;
const samples = (label, values) => values.map((value) => `${value}`).join(", ");

function testTable(group) {
  return results.tests
    .filter((item) => item.group === group)
    .map((item) => {
      const result = item.status === "pass" ? "Pass" : item.status === "fail" ? "Fail" : "Unsupported";
      const claim = (item.claim || "").replace(/\|/g, "/");
      return `| ${result} | \`${item.id}\` | ${claim} |`;
    })
    .join("\n");
}

const secondary = results.secondaryTiming;
const secondarySection = secondary
  ? [
      "## Secondary timing, not canonical",
      "",
      secondary.note,
      "",
      `- Node \`${secondary.measurement.node}\``,
      `- Reported build \`${secondary.buildMs}\` ms (medianBuildMs \`${secondary.measurement.medianBuildMs}\`)`,
      `- Reported verify \`${secondary.verifyMs}\` ms (medianVerifyMs \`${secondary.measurement.medianVerifyMs}\`)`,
      `- ${secondary.measurement.summary}`,
      "",
    ].join("\n")
  : ["## Secondary timing, not canonical", "", "No secondary timing file was recorded.", ""].join("\n");

const report = `# GovernPilot proof of work

This folder records one run of the product checks and the adversarial harness. The counts, the 10,000-record timings, and the log extracts below are copied from \`results.json\`. \`demo.html\` reads the same \`timing.buildMs\` and \`timing.verifyMs\` fields.

The original product pin is \`${results.pinnedProductCommit}\`. \`headAtRun\` is \`${results.headAtRun}\`. \`productTreeMatchesPin\` is \`${results.productTreeMatchesPin}\`.

## Counts

| Group | Pass | Fail | Unsupported | Total |
| --- | ---: | ---: | ---: | ---: |
| Existing suite | ${existingSuite.pass} | ${existingSuite.fail} | ${existingSuite.unsupported} | ${existingSuite.total} |
| Adversarial harness | ${adversarial.pass} | ${adversarial.fail} | ${adversarial.unsupported} | ${adversarial.total} |
| **All recorded tests** | **${all.pass}** | **${all.fail}** | **${all.unsupported}** | **${all.total}** |

The demo header uses \`summary.all\`, so the on-screen counts are ${all.pass} pass, ${all.fail} fail, and ${all.unsupported} unsupported.

Run window: \`${results.startedAt}\` to \`${results.finishedAt}\`.

Node \`${results.node}\`, npm \`${results.npm}\`, ${results.platform}. ${results.ciNodeNote}

Log extracts, copied verbatim:

- \`${results.logExtracts.conformanceL1Line}\`
- \`${results.logExtracts.tckBlackBoxLine}\`
- \`${results.logExtracts.tckAttestationLine}\`

## Canonical 10,000-record timing

These integers are \`timing.buildMs\` and \`timing.verifyMs\`. The demo prints those same fields.

- Build: **${timing.buildMs}** ms
- Verify: **${timing.verifyMs}** ms
- Entries: ${timing.entries}
- Tamper at index ${timing.tamperedIndex} detected: ${timing.tamperDetected}
- Derived verify rate stored as \`verifyEntriesPerSecond\`: ${timing.verifyEntriesPerSecond}
- Unrounded medians stored as \`medianBuildMs\` / \`medianVerifyMs\`: ${m.medianBuildMs} / ${m.medianVerifyMs}
- Method: \`${m.method}\`
- Clock: \`${m.clock}\`
- Samples: ${m.sampleCount} measured runs after ${m.warmupRunsDiscarded} discarded warmup
- Build samples, ms: ${samples("build", m.buildSamplesMs)}
- Verify samples, ms: ${samples("verify", m.verifySamplesMs)}
- Node: \`${m.node}\`
- Machine: ${m.platform}, kernel \`${m.osRelease}\`, ${m.cpuCount} CPU, \`${m.cpuModel}\`, ${m.totalMemoryBytes} bytes RAM
- Summary string shown on the demo: ${m.summary}

The displayed build and verify integers are \`Math.round\` of those medians. This is in-process HMAC work, not ${timing.entries} HTTP calls.

${secondarySection}
## Reproduce

From a checkout of this branch:

\`\`\`bash
proof-of-work/run-all.sh
cd proof-of-work && sha256sum -c manifest.sha256
\`\`\`

The committed run was produced with Node \`${results.node}\` on PATH. The runner restores only generated artifacts (\`data/sentinelops-state.json\`, the conformance report, and the compliance drafts the suite rewrites). It does not revert product source. The repository ignores \`*.log\`. \`proof-of-work/.gitignore\` keeps this run's logs so the manifest still matches after checkout.

Open \`proof-of-work/demo.html\`. The page uses the embedded copy of \`results.json\`, and prefers a sibling \`results.json\` when a local web server can fetch it. No network assets.

## What the checks show

**Head and length anchor.** Each approval write stores \`approvalLedgerAnchor\`. ${results.tests.find((item) => item.id === "head_truncation_detected")?.detail || ""}

**Empty ledger.** ${results.tests.find((item) => item.id === "empty_ledger_detected")?.detail || ""}

**Development key.** ${results.tests.find((item) => item.id === "dev_key_resigned_chain_rejected")?.detail || ""}

**Stable content hashes.** ${results.tests.find((item) => item.id === "top_level_evidence_hash_is_stable")?.detail || ""}

**Policy fail closes the write.** ${results.tests.find((item) => item.id === "policy_violating_write_blocked")?.detail || ""}

**Policy deadline.** ${results.tests.find((item) => item.id === "policy_check_timeout_fail_closed")?.detail || ""} The default deadline is 5 seconds via the environment variable \`SENTINELOPS_POLICY_TIMEOUT_MS\`.

## Tamper-detection demo

The page uses the five-record chain from this run. Newest card on the left. Each card's \`previousHash\` is supposed to equal the signature of the card to its right.

1. **Clean chain.** All five seals and all four links verified.
2. **Edit.** The reviewer on \`story-00002\` was changed and the signature bytes were left alone. That card's HMAC no longer matches.
3. **Delete.** \`story-00002\` was removed. The newer card still names the deleted signature, so that link fails.
4. **Newest record removed.** ${results.tests.find((item) => item.id === "head_truncation_detected")?.detail || ""}
5. **Empty list.** ${results.tests.find((item) => item.id === "empty_ledger_detected")?.detail || ""}

On the live API, three approvals were stored and the integrity endpoint accepted the ledger. Editing one approval's reviewer on disk made the next integrity read fail.

The 10,000-record panel on that page prints build ${timing.buildMs} ms and verify ${timing.verifyMs} ms, which are \`timing.buildMs\` and \`timing.verifyMs\`.

## Still open

These stayed unsupported.

${results.findings
  .map((item, index) => `${index + 1}. **\`${item.id}\`** (${item.status}). ${item.detail}`)
  .join("\n")}

Legacy state files that have no \`approvalLedgerAnchor\` are still checked only for internal consistency until the next approval seals an anchor. Someone who holds the signing key and can rewrite the state file can reseal that anchor.

## Pass / fail table

### Existing suite

| Result | Test | Claim |
| --- | --- | --- |
${testTable("existing-suite")}

### Adversarial harness

| Result | Test | Claim |
| --- | --- | --- |
${testTable("adversarial")}

## Names a reviewer will see

The buyer-facing name in this report and on \`demo.html\` is GovernPilot. The package name is still \`${results.packageName}\`. These identifiers are left as they appear in code, environment variables, and file paths:

- Package and service ids: \`sentinelops-ai\`, \`sentinelops-api\`
- Environment variables prefixed \`SENTINELOPS_\`, including \`SENTINELOPS_POLICY_TIMEOUT_MS\`, \`SENTINELOPS_SIGNING_SECRET\`, \`SENTINELOPS_LOCAL_STATE_PATH\`
- State file \`data/sentinelops-state.json\`
- Module path \`agent/sentinelops-agent.mjs\`
- Signature mode string \`local-dev-hmac-sha256\`, which the demo prints on the clean-chain panel

## What this does not claim

This is not a penetration test, a FedRAMP or CMMC authorization, or a legal opinion. Conformance here is the repository's own suite, re-run and logged.
`;

const stale = ["33 pass", "5 fail", "6 unsupported", "18 pass"];
for (const phrase of stale) {
  if (report.includes(phrase)) {
    throw new Error(`REPORT would contain stale phrase: ${phrase}`);
  }
}
for (const required of [
  String(all.pass),
  String(all.fail),
  String(all.unsupported),
  String(timing.buildMs),
  String(timing.verifyMs),
  results.node,
  results.startedAt,
  m.summary,
]) {
  if (!report.includes(required)) {
    throw new Error(`REPORT is missing ${required}`);
  }
}

writeFileSync(new URL("../REPORT.md", import.meta.url), report);
console.log("wrote REPORT.md from results.json");
