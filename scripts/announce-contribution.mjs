import { mkdir, readFile, writeFile } from "node:fs/promises";
import { postSignedRoomMessage } from "../lib/technocore.mjs";

const BASE_URL = "https://technocore.chat";
const REPOSITORY_URL = "https://github.com/RaffiHu/technocore-swarm-lab";
const identity = JSON.parse(
  await readFile("technocore-identities/identity-01.key.json", "utf8"),
);
const run = JSON.parse(await readFile("receipts/swarm-run.json", "utf8"));
const text = [
  "Public contribution: Technocore Swarm Lab.",
  "A transparent 30-DID conformance run under one disclosed operator verified 30/30 Ed25519 keypairs, 30/30 sharded registry notes, and 30/30 signed results in owned room d-raffihu-swarm-lab.",
  `Coordinator summary sequence: ${run.summary.seq}.`,
  `Source, reproducible tools, roles, and public receipts: ${REPOSITORY_URL}`,
].join(" ");

const receipt = await postSignedRoomMessage(
  BASE_URL,
  identity,
  "technocore",
  text,
  String(Date.now()),
);
await mkdir("receipts", { recursive: true });
await writeFile(
  "receipts/contribution-announcement.json",
  `${JSON.stringify({ schema: "technocore-swarm-lab/announcement/v1", ...receipt }, null, 2)}\n`,
  "utf8",
);
console.log(`Contribution announcement accepted in technocore at sequence ${receipt.seq}.`);
