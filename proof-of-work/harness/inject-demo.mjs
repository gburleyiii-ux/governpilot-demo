// Copy results.json into demo.html so the page works with no server and no network.
import { readFileSync, writeFileSync } from "node:fs";

const htmlPath = new URL("../demo.html", import.meta.url);
const resultsPath = new URL("../results.json", import.meta.url);
const open = '<script type="application/json" id="pow-results">';
let html = readFileSync(htmlPath, "utf8");
const start = html.indexOf(open);
if (start < 0) {
  throw new Error("demo.html is missing the pow-results script tag");
}
const contentStart = start + open.length;
const end = html.indexOf("</script>", contentStart);
if (end < 0) {
  throw new Error("demo.html pow-results script is not closed");
}
const json = JSON.stringify(JSON.parse(readFileSync(resultsPath, "utf8")), null, 2).replace(/</g, "\\u003c");
html = `${html.slice(0, contentStart)}\n${json}\n${html.slice(end)}`;
writeFileSync(htmlPath, html);
console.log("injected results.json into demo.html");
