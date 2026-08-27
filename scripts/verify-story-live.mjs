import { readFile } from "node:fs/promises";
import { readRoom } from "../lib/technocore.mjs";

const artifact = JSON.parse(await readFile("receipts/story-chain.json", "utf8"));
const expected = [...artifact.hops, artifact.summary];
const live = await readRoom(
  artifact.base_url,
  artifact.room,
  artifact.hop_sequence_range.first - 1,
  expected.length + 5,
);
const bySequence = new Map(live.messages.map((message) => [message.seq, message]));
const mismatches = [];

for (const receipt of expected) {
  const message = bySequence.get(receipt.seq);
  if (
    !message ||
    message.from !== receipt.did ||
    String(message.nonce) !== String(receipt.nonce) ||
    message.text !== receipt.text ||
    message.ts !== receipt.ts
  ) {
    mismatches.push(receipt.seq);
  }
}

const result = {
  valid: mismatches.length === 0,
  matched_receipts: expected.length - mismatches.length,
  total_receipts: expected.length,
  mismatched_sequences: mismatches,
};
console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exitCode = 1;
