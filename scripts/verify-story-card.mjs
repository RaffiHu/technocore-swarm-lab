import { readFile } from "node:fs/promises";

const artifact = JSON.parse(await readFile("receipts/story-chain.json", "utf8"));
const svg = await readFile("assets/story-chain.svg", "utf8");
const checks = {
  word_dots: (svg.match(/class="word-dot"/g)?.length ?? 0) === artifact.hops.length,
  final_hash: svg.includes(artifact.final_hash),
  final_story: svg.includes(artifact.final_story.replaceAll("&", "&amp;")),
  story_id: svg.includes(artifact.story_id),
  no_script: !/<script\b/i.test(svg),
};
const valid = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ valid, checks }, null, 2));
if (!valid) process.exitCode = 1;
