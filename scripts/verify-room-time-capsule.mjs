import { readFile, readdir } from "node:fs/promises";
import {
  collectArchivedReceipts,
  verifyTimeCapsuleArtifact,
} from "../lib/timecapsule.mjs";

const manifest = JSON.parse(await readFile("agents.public.json", "utf8"));
const swarm = JSON.parse(await readFile("receipts/swarm-run.json", "utf8"));
const baton = JSON.parse(await readFile("receipts/baton-relay.json", "utf8"));
const story = JSON.parse(await readFile("receipts/story-chain.json", "utf8"));
const artifact = JSON.parse(await readFile("receipts/room-time-capsule.json", "utf8"));
const observatories = [JSON.parse(await readFile("receipts/protocol-observatory.json", "utf8"))];
for (const name of await readdir("receipts/observatory-history")) {
  if (name.endsWith(".json")) {
    observatories.push(JSON.parse(await readFile(`receipts/observatory-history/${name}`, "utf8")));
  }
}
const archivedReceipts = collectArchivedReceipts({ swarm, baton, story, observatories });
const bytes = await readFile(artifact.export.file);
const result = verifyTimeCapsuleArtifact(manifest, artifact, bytes, archivedReceipts);
console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exitCode = 1;
