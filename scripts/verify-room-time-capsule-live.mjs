import { readFile } from "node:fs/promises";
import { fetchRoomExportWithRetry, parseJsonl } from "../lib/timecapsule.mjs";

const artifact = JSON.parse(await readFile("receipts/room-time-capsule.json", "utf8"));
const captured = await readFile(artifact.export.file);
const { response, bytes: current } = await fetchRoomExportWithRetry(
  `${artifact.base_url}/r/${artifact.room}/export?n=${Date.now()}`,
);
if (!response.ok) throw new Error(`Live export failed with HTTP ${response.status}`);
const records = parseJsonl(current);
const sealRecord = records.find((record) => record.seq === artifact.seal.seq);
const prefixPreserved = current.subarray(0, captured.length).equals(captured);
const sealMatched = Boolean(
  sealRecord &&
  sealRecord.from === artifact.seal.did &&
  sealRecord.text === artifact.seal.text &&
  String(sealRecord.nonce) === String(artifact.seal.nonce) &&
  sealRecord.sig === artifact.seal.signature,
);
const result = {
  valid: prefixPreserved && sealMatched && response.headers.get("x-room-generation") === String(artifact.export.generation),
  generation: response.headers.get("x-room-generation"),
  captured_prefix_records: artifact.export.records,
  current_records: records.length,
  prefix_preserved: prefixPreserved,
  seal_sequence: artifact.seal.seq,
  seal_embedded_and_matched: sealMatched,
};
console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exitCode = 1;
