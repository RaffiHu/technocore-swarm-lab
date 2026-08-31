import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { postSignedRoomMessage, requestWithRetry } from "../lib/technocore.mjs";
import {
  analyzeRoomExport,
  collectArchivedReceipts,
  fetchRoomExportWithRetry,
  timeCapsuleSealText,
} from "../lib/timecapsule.mjs";

const BASE_URL = "https://technocore.chat";
const ROOM = "d-raffihu-swarm-lab";
const SOURCE = "https://github.com/RaffiHu/technocore-swarm-lab";
const EXPORT_FILE = "receipts/room-time-capsule.jsonl";

const manifest = JSON.parse(await readFile("agents.public.json", "utf8"));
const swarm = JSON.parse(await readFile("receipts/swarm-run.json", "utf8"));
const baton = JSON.parse(await readFile("receipts/baton-relay.json", "utf8"));
const story = JSON.parse(await readFile("receipts/story-chain.json", "utf8"));
const observatoryPaths = ["receipts/protocol-observatory.json"];
for (const name of await readdir("receipts/observatory-history")) {
  if (name.endsWith(".json")) observatoryPaths.push(`receipts/observatory-history/${name}`);
}
const observatories = [];
for (const path of observatoryPaths) {
  observatories.push(JSON.parse(await readFile(path, "utf8")));
}
const archivedReceipts = collectArchivedReceipts({ swarm, baton, story, observatories });

const { response, bytes } = await fetchRoomExportWithRetry(
  `${BASE_URL}/r/${ROOM}/export?n=${Date.now()}`,
);
if (!response.ok) throw new Error(`Room export failed with HTTP ${response.status}`);
const generation = response.headers.get("x-room-generation");
const analysis = analyzeRoomExport(manifest, ROOM, bytes, archivedReceipts);
if (!analysis.valid) throw new Error(`Export analysis failed: ${analysis.errors.join("; ")}`);
if (analysis.records !== archivedReceipts.length) {
  throw new Error(`Expected ${archivedReceipts.length} archived records, export has ${analysis.records}`);
}

const identity = JSON.parse(await readFile("technocore-identities/identity-01.key.json", "utf8"));
if (identity.did !== manifest.agents[0].did) throw new Error("Coordinator identity mismatch");
const owner = await requestWithRetry(`${BASE_URL}/kv/room-owners/${ROOM}`);
if (!owner.response.ok || !owner.body.includes(identity.did)) {
  throw new Error("Coordinator no longer owns the capsule room");
}
const text = timeCapsuleSealText({ room: ROOM, generation, analysis, source: SOURCE });
const seal = await postSignedRoomMessage(BASE_URL, identity, ROOM, text, String(Date.now()));
const artifact = {
  schema: "technocore-swarm-lab/room-time-capsule/v1",
  captured_at: new Date().toISOString(),
  room: ROOM,
  base_url: BASE_URL,
  repository: SOURCE,
  common_operator: "RaffiHu",
  export: {
    file: EXPORT_FILE,
    content_type: response.headers.get("content-type"),
    generation,
    bytes: analysis.bytes,
    records: analysis.records,
    first_sequence: analysis.first_sequence,
    last_sequence: analysis.last_sequence,
    sha256: analysis.sha256,
  },
  verification: analysis,
  seal,
};

await mkdir("receipts", { recursive: true });
await mkdir("reports", { recursive: true });
await writeFile(EXPORT_FILE, bytes);
await writeFile("receipts/room-time-capsule.json", `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
await writeFile(
  "reports/room-time-capsule.md",
  `# Signed room time capsule\n\n` +
    `Captured generation ${generation} of \`${ROOM}\` as byte-exact JSONL before sealing it at sequence ${seal.seq}.\n\n` +
    `- Export sequences: ${analysis.first_sequence}–${analysis.last_sequence}\n` +
    `- Records: ${analysis.records}\n` +
    `- Bytes: ${analysis.bytes.toLocaleString("en-US")}\n` +
    `- SHA-256: \`${analysis.sha256}\`\n` +
    `- Records matched to public receipts: ${analysis.matched_receipts}/${analysis.records}\n` +
    `- Archived signatures verified: ${analysis.verified_archived_signatures}/${analysis.records}\n` +
    `- Self-contained embedded signatures verified: ${analysis.verified_embedded_signatures}/${analysis.embedded_signatures}\n` +
    `- Legacy records without embedded \`sig\`: ${analysis.legacy_records_without_embedded_signature}\n\n` +
    `Records 1–95 predate Technocore 0.11.0 and legitimately omit \`sig\`; their signatures remain in this repository's earlier public receipts. Record 96 demonstrates the new self-contained format.\n\n` +
    `Verify offline with \`bun run verify:capsule\`, or confirm the preserved prefix and seal against the live room with \`bun run verify:capsule:live\`.\n`,
  "utf8",
);
console.log(`Capsule sealed at sequence ${seal.seq}: ${analysis.records}/${analysis.records} records and signatures verified.`);
