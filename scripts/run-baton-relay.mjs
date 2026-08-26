import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  postSignedRoomMessage,
  requestWithRetry,
  sleep,
} from "../lib/technocore.mjs";
import {
  relayBatonOut,
  relayGenesis,
  relayText,
  verifyPublicReceipt,
} from "../lib/relay.mjs";

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
  throw new Error("Coordinator no longer owns the relay room");
}
if (!allow.response.ok || !identities.every((identity) => allow.body.includes(identity.did))) {
  throw new Error("Relay room no longer allow-lists all 30 identities");
}

const relayId = new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14);
let baton = relayGenesis(relayId, ROOM, manifestSha256);
const genesis = baton;
const hops = [];

for (let index = 0; index < identities.length; index += 1) {
  if (index > 0) {
    const previous = hops[index - 1];
    const previousAgent = manifest.agents[index - 1];
    if (!verifyPublicReceipt(previousAgent, previous)) {
      throw new Error(`Agent ${identities[index].agent} refused invalid hop ${index}`);
    }
    if (relayBatonOut(previous.baton_in, previous) !== baton) {
      throw new Error(`Agent ${identities[index].agent} refused a broken baton chain`);
    }
  }

  const identity = identities[index];
  const agent = manifest.agents[index];
  const text = relayText({
    relayId,
    hop: index + 1,
    total: identities.length,
    agent,
    batonIn: baton,
    source: SOURCE,
  });
  const receipt = await postSignedRoomMessage(
    BASE_URL,
    identity,
    ROOM,
    text,
    String(Date.now()),
  );
  const batonOut = relayBatonOut(baton, receipt);
  hops.push({
    ...receipt,
    hop: index + 1,
    agent: identity.agent,
    role: identity.role,
    baton_in: baton,
    baton_out: batonOut,
  });
  baton = batonOut;
  console.log(
    `[${identity.agent}/30] verified previous hop and forwarded baton at sequence ${receipt.seq}`,
  );
  await sleep(WRITE_INTERVAL_MS);
}

const firstSequence = hops[0].seq;
const lastSequence = hops.at(-1).seq;
const summaryText = [
  "BATON-RELAY v1 COMPLETE",
  `relay=${relayId}`,
  "hops=30/30",
  `hop_sequences=${firstSequence}-${lastSequence}`,
  `genesis=${genesis}`,
  `final_baton=${baton}`,
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
  schema: "technocore-swarm-lab/baton-relay/v1",
  relay_id: relayId,
  room: ROOM,
  base_url: BASE_URL,
  repository: SOURCE,
  common_operator: "RaffiHu",
  manifest_sha256: manifestSha256,
  genesis_baton: genesis,
  final_baton: baton,
  hop_sequence_range: { first: firstSequence, last: lastSequence },
  hops,
  summary,
};
await mkdir("receipts", { recursive: true });
await mkdir("reports", { recursive: true });
await writeFile("receipts/baton-relay.json", `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
await writeFile(
  "reports/baton-relay.md",
  `# Cryptographic baton relay ${relayId}\n\n` +
    `Thirty disclosed agent identities passed a hash-linked baton through \`${ROOM}\`. ` +
    `Each agent verified the preceding room signature and baton hash before signing its own hop.\n\n` +
    `- Genesis baton: \`${genesis}\`\n` +
    `- Final baton: \`${baton}\`\n` +
    `- Hop sequences: ${firstSequence}–${lastSequence}\n` +
    `- Signed coordinator summary: sequence ${summary.seq}\n` +
    `- Offline verification: \`npm run verify:relay\`\n\n` +
    `Machine-readable proof: [\`receipts/baton-relay.json\`](../receipts/baton-relay.json).\n`,
  "utf8",
);
console.log(`Relay complete with final baton ${baton}; summary sequence ${summary.seq}.`);
