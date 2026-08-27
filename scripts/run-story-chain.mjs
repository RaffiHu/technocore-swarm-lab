import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { postSignedRoomMessage, requestWithRetry, sleep } from "../lib/technocore.mjs";
import {
  chooseStoryWord,
  storyGenesis,
  storyHashOut,
  storyText,
} from "../lib/storychain.mjs";
import { verifyPublicReceipt } from "../lib/relay.mjs";

const BASE_URL = "https://technocore.chat";
const ROOM = "d-raffihu-swarm-lab";
const SOURCE = "https://github.com/RaffiHu/technocore-swarm-lab";
const WRITE_INTERVAL_MS = 2200;

const manifestBytes = await readFile("agents.public.json");
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
const identities = [];
for (const agent of manifest.agents) {
  const identity = JSON.parse(
    await readFile(`technocore-identities/identity-${agent.agent}.key.json`, "utf8"),
  );
  if (identity.did !== agent.did) throw new Error(`Agent ${agent.agent} identity mismatch`);
  identities.push({ ...identity, agent: agent.agent, role: agent.role });
}

const [owner, allow] = await Promise.all([
  requestWithRetry(`${BASE_URL}/kv/room-owners/${ROOM}`),
  requestWithRetry(`${BASE_URL}/kv/room-allow/${ROOM}`),
]);
if (!owner.response.ok || !owner.body.includes(identities[0].did)) {
  throw new Error("Coordinator no longer owns the story room");
}
if (!allow.response.ok || !identities.every((identity) => allow.body.includes(identity.did))) {
  throw new Error("Story room no longer allow-lists all 30 identities");
}

const storyId = new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14);
let hash = storyGenesis(storyId, ROOM, manifestSha256);
const genesis = hash;
const words = [];
const hops = [];

for (let index = 0; index < identities.length; index += 1) {
  if (index > 0) {
    const previous = hops[index - 1];
    if (!verifyPublicReceipt(manifest.agents[index - 1], previous)) {
      throw new Error(`Agent ${identities[index].agent} refused invalid story hop ${index}`);
    }
    if (storyHashOut(previous.previous_hash, previous) !== hash) {
      throw new Error(`Agent ${identities[index].agent} refused a broken story chain`);
    }
  }
  const identity = identities[index];
  const agent = manifest.agents[index];
  const word = chooseStoryWord({
    storyId,
    hop: index + 1,
    previousHash: hash,
    did: identity.did,
  });
  words.push(word);
  const story = words.join(" ");
  const text = storyText({
    storyId,
    hop: index + 1,
    total: identities.length,
    agent,
    previousHash: hash,
    word,
    story,
    source: SOURCE,
  });
  const receipt = await postSignedRoomMessage(
    BASE_URL,
    identity,
    ROOM,
    text,
    String(Date.now()),
  );
  const hashOut = storyHashOut(hash, receipt);
  hops.push({
    ...receipt,
    hop: index + 1,
    agent: identity.agent,
    word,
    story_so_far: story,
    previous_hash: hash,
    hash_out: hashOut,
  });
  hash = hashOut;
  console.log(`[${identity.agent}/30] added “${word}” at sequence ${receipt.seq}`);
  await sleep(WRITE_INTERVAL_MS);
}

const finalStory = words.join(" ");
const summaryText = [
  "STORY-CHAIN v1 COMPLETE",
  `story_id=${storyId}`,
  "words=30/30",
  `hop_sequences=${hops[0].seq}-${hops.at(-1).seq}`,
  `final_hash=${hash}`,
  `story=\"${finalStory}\"`,
  "common_operator=RaffiHu",
  `source=${SOURCE}`,
].join(" ");
const summary = await postSignedRoomMessage(
  BASE_URL,
  identities[0],
  ROOM,
  summaryText,
  String(Date.now()),
);

const artifact = {
  schema: "technocore-swarm-lab/story-chain/v1",
  story_id: storyId,
  room: ROOM,
  base_url: BASE_URL,
  repository: SOURCE,
  common_operator: "RaffiHu",
  manifest_sha256: manifestSha256,
  genesis_hash: genesis,
  final_hash: hash,
  final_story: finalStory,
  hop_sequence_range: { first: hops[0].seq, last: hops.at(-1).seq },
  hops,
  summary,
};
await mkdir("receipts", { recursive: true });
await mkdir("reports", { recursive: true });
await writeFile("receipts/story-chain.json", `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
await writeFile(
  "reports/story-chain.md",
  `# Signed story chain ${storyId}\n\n` +
    `Thirty disclosed agent identities composed one deterministic 30-word story in \`${ROOM}\`. ` +
    `Each word depends on the preceding signed receipt, making the finished story reproducible and tamper-evident.\n\n` +
    `> ${finalStory}\n\n` +
    `- Final hash: \`${hash}\`\n` +
    `- Hop sequences: ${hops[0].seq}–${hops.at(-1).seq}\n` +
    `- Signed coordinator summary: sequence ${summary.seq}\n` +
    `- Offline verification: \`npm run verify:story\`\n\n` +
    `Machine-readable proof: [\`receipts/story-chain.json\`](../receipts/story-chain.json).\n`,
  "utf8",
);
console.log(`Story complete at sequence ${summary.seq}: ${finalStory}`);
