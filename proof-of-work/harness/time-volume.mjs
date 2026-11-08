// Secondary timing on whatever Node binary launches this file. Not canonical.
import { writeFileSync } from "node:fs";
import { measureTenThousand } from "./volume-timing.mjs";

const evidence = await measureTenThousand();
const outPath = process.argv[2];
if (!outPath) {
  throw new Error("usage: time-volume.mjs <out.json>");
}
writeFileSync(outPath, `${JSON.stringify({ canonical: false, ...evidence }, null, 2)}\n`);
console.log(`${evidence.measurement.node} build ${evidence.buildMs} ms verify ${evidence.verifyMs} ms`);
