import { mkdir, readFile, writeFile } from "node:fs/promises";
import { postSignedRoomMessage, requestWithRetry } from "../lib/technocore.mjs";
import {
  OBSERVATORY_PATHS,
  buildObservatorySnapshot,
  observatoryPostcardText,
  snapshotHash,
} from "../lib/observatory.mjs";

const BASE_URL = "https://technocore.chat";
const ROOM = "d-raffihu-swarm-lab";
const SOURCE = "https://github.com/RaffiHu/technocore-swarm-lab";

let previousArtifact = null;
try {
  previousArtifact = JSON.parse(await readFile("receipts/protocol-observatory.json", "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const documents = [];
for (const path of OBSERVATORY_PATHS) {
  const { response, body } = await requestWithRetry(`${BASE_URL}${path}?n=${Date.now()}`);
  documents.push({
    path,
    status: response.status,
    content_type: response.headers.get("content-type")?.split(";")[0] ?? null,
    body,
  });
}
const snapshot = buildObservatorySnapshot({
  baseUrl: BASE_URL,
  observedAt: new Date().toISOString(),
  documents,
});
const failed = snapshot.checks.filter((item) => !item.passed);
if (failed.length) throw new Error(`Observatory checks failed: ${failed.map((item) => item.name).join(", ")}`);
const hash = snapshotHash(snapshot);

const manifest = JSON.parse(await readFile("agents.public.json", "utf8"));
const identity = JSON.parse(await readFile("technocore-identities/identity-01.key.json", "utf8"));
if (identity.did !== manifest.agents[0].did) throw new Error("Coordinator identity mismatch");
const owner = await requestWithRetry(`${BASE_URL}/kv/room-owners/${ROOM}`);
if (!owner.response.ok || !owner.body.includes(identity.did)) {
  throw new Error("Coordinator no longer owns the observatory room");
}
const supersedesSeq = previousArtifact?.postcard?.seq ?? null;
const text = observatoryPostcardText({
  snapshot,
  hash,
  room: ROOM,
  source: SOURCE,
  supersedesSeq,
});
const postcard = await postSignedRoomMessage(BASE_URL, identity, ROOM, text, String(Date.now()));
const artifact = {
  schema: "technocore-swarm-lab/protocol-observatory-receipt/v1",
  room: ROOM,
  repository: SOURCE,
  common_operator: "RaffiHu",
  supersedes_postcard_seq: supersedesSeq,
  snapshot,
  snapshot_hash: hash,
  postcard,
};

await mkdir("receipts", { recursive: true });
await mkdir("reports", { recursive: true });
if (previousArtifact) {
  await mkdir("receipts/observatory-history", { recursive: true });
  const previousVersion = previousArtifact.snapshot.service.version.replaceAll(/[^0-9A-Za-z.-]/g, "-");
  const previousSequence = previousArtifact.postcard.seq;
  await writeFile(
    `receipts/observatory-history/${previousVersion}-seq${previousSequence}.json`,
    `${JSON.stringify(previousArtifact, null, 2)}\n`,
    "utf8",
  );
}
await writeFile("receipts/protocol-observatory.json", `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
const limits = snapshot.service.limits;
await writeFile(
  "reports/protocol-observatory.md",
  `# Technocore protocol observatory\n\n` +
    `Observed ${snapshot.service.name} ${snapshot.service.version} at ${snapshot.observed_at}. ` +
    `All ${snapshot.checks.length} cross-document checks passed across ${snapshot.documents.length} public discovery surfaces.\n\n` +
    `- OpenAPI paths: ${snapshot.service.openapi_path_count}\n` +
    `- Declared room capacity: ${limits.rooms.toLocaleString("en-US")}\n` +
    `- Declared note capacity: ${limits.notes.toLocaleString("en-US")}\n` +
    `- Reads/writes per minute per IP: ${limits.reads_per_minute_per_ip}/${limits.writes_per_minute_per_ip}\n` +
    `- Snapshot hash: \`${hash}\`\n` +
    `- Signed postcard: owned-room sequence ${postcard.seq}\n\n` +
    (supersedesSeq === null
      ? ""
      : `This snapshot supersedes sequence ${supersedesSeq}. Earlier signed snapshots remain in ` +
        "`receipts/observatory-history/`. The rolling `Expires:` field in `security.txt` is semantically " +
        "normalized while its raw hash remains preserved.\n\n") +
    `This is a point-in-time interoperability snapshot, not an availability SLA. ` +
    `Verify it offline with \`bun run verify:observatory\` or detect live drift with \`bun run verify:observatory:live\`.\n`,
  "utf8",
);
console.log(`Observed ${snapshot.documents.length} surfaces; ${snapshot.checks.length}/${snapshot.checks.length} checks passed; postcard sequence ${postcard.seq}.`);
