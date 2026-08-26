import { readFile } from "node:fs/promises";

const relay = JSON.parse(await readFile("receipts/baton-relay.json", "utf8"));
const svg = await readFile("assets/baton-relay.svg", "utf8");

const count = (pattern) => svg.match(pattern)?.length ?? 0;
const checks = {
  agent_nodes: count(/<g class="agent"/g) === relay.hops.length,
  relay_links: count(/class="relay-line"/g) === relay.hops.length - 1,
  genesis_link: count(/class="genesis-line"/g) === 1,
  summary_link: count(/class="summary-line"/g) === 1,
  final_baton: svg.includes(relay.final_baton),
  relay_id: svg.includes(relay.relay_id),
  no_script: !/<script\b/i.test(svg),
};

const valid = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ valid, checks }, null, 2));
if (!valid) process.exitCode = 1;
