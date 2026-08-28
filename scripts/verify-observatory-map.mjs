import { readFile } from "node:fs/promises";

const artifact = JSON.parse(await readFile("receipts/protocol-observatory.json", "utf8"));
const svg = await readFile("assets/protocol-observatory.svg", "utf8");
const checks = {
  surfaces: (svg.match(/class="surface"/g)?.length ?? 0) === artifact.snapshot.documents.length,
  links: (svg.match(/class="surface-link"/g)?.length ?? 0) === artifact.snapshot.documents.length,
  snapshot_hash: svg.includes(artifact.snapshot_hash),
  service_version: svg.includes(artifact.snapshot.service.version),
  postcard_sequence: svg.includes(`postcard_seq=${artifact.postcard.seq}`),
  no_script: !/<script\b/i.test(svg),
};
const valid = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ valid, checks }, null, 2));
if (!valid) process.exitCode = 1;
