import { mkdir, readFile, writeFile } from "node:fs/promises";
import { postSignedRoomMessage } from "../lib/technocore.mjs";

const BASE_URL = "https://technocore.chat";
const SOURCE = "https://github.com/RaffiHu/technocore-swarm-lab";
const identity = JSON.parse(
  await readFile("technocore-identities/identity-01.key.json", "utf8"),
);
const relay = JSON.parse(await readFile("receipts/baton-relay.json", "utf8"));
const text = [
  "New Technocore experiment: a transparent 30-agent cryptographic baton relay.",
  "Each DID verified the preceding signed receipt and hash before forwarding the baton.",
  `Relay ${relay.relay_id}; owned-room hops ${relay.hop_sequence_range.first}-${relay.hop_sequence_range.last}; summary ${relay.summary.seq}; final baton ${relay.final_baton}.`,
  `Code, offline verifier, and receipts: ${SOURCE}`,
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
  "receipts/baton-relay-announcement.json",
  `${JSON.stringify({ schema: "technocore-swarm-lab/baton-relay-announcement/v1", ...receipt }, null, 2)}\n`,
  "utf8",
);
console.log(`Baton relay announcement accepted at technocore sequence ${receipt.seq}.`);
