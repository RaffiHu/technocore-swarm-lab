import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  deriveIdentity,
  postSignedRoomMessage,
  registryLocation,
  requestWithRetry,
  signOwnedNote,
  sleep,
} from "../lib/technocore.mjs";

const BASE_URL = "https://technocore.chat";
const ROOM = "d-raffihu-swarm-lab";
const REPOSITORY_URL = "https://github.com/RaffiHu/technocore-swarm-lab";
const WRITE_INTERVAL_MS = 2200;

const manifest = JSON.parse(await readFile("agents.public.json", "utf8"));
const identities = [];
for (const agent of manifest.agents) {
  const identity = JSON.parse(
    await readFile(`technocore-identities/identity-${agent.agent}.key.json`, "utf8"),
  );
  const derived = deriveIdentity(identity.private_jwk);
  if (derived.did !== agent.did || identity.did !== agent.did) {
    throw new Error(`Agent ${agent.agent} private key does not derive its public manifest DID`);
  }
  identities.push({ ...identity, role: agent.role, agent: agent.agent });
}

const coordinator = identities[0];
const ownerNoteUrl = `${BASE_URL}/kv/room-owners/${ROOM}`;
let ownerRead = await requestWithRetry(ownerNoteUrl);
let ownershipStatus = "existing";
if (ownerRead.response.status === 404) {
  const claimNonce = String(Date.now());
  const claimSignature = signOwnedNote(
    coordinator,
    "room-owners",
    ROOM,
    claimNonce,
    coordinator.did,
  );
  const claimUrl = `${BASE_URL}/kv/room-owners/${ROOM}/set-signed/${encodeURIComponent(coordinator.did)}/${claimSignature}/${claimNonce}/${encodeURIComponent(coordinator.did)}?if_absent=1`;
  const claim = await requestWithRetry(claimUrl);
  if (!claim.response.ok && !(claim.response.status === 409 && claim.body.includes(coordinator.did))) {
    throw new Error(`Owned-room claim failed with HTTP ${claim.response.status}: ${claim.body.slice(0, 500)}`);
  }
  ownershipStatus = "claimed";
  await sleep(WRITE_INTERVAL_MS);
  ownerRead = await requestWithRetry(ownerNoteUrl);
}
if (!ownerRead.response.ok || !ownerRead.body.includes(coordinator.did)) {
  throw new Error(`Room ${ROOM} is not owned by coordinator DID`);
}

const allowValue = identities.map((identity) => identity.did).join(" ");
const allowNonce = String(Date.now());
const allowSignature = signOwnedNote(coordinator, "room-allow", ROOM, allowNonce, allowValue);
const allowUrl = `${BASE_URL}/kv/room-allow/${ROOM}/set-signed/${encodeURIComponent(coordinator.did)}/${allowSignature}/${allowNonce}/${encodeURIComponent(allowValue)}`;
const allowWrite = await requestWithRetry(allowUrl);
if (!allowWrite.response.ok) {
  throw new Error(`Owned-room allow-list failed with HTTP ${allowWrite.response.status}: ${allowWrite.body.slice(0, 500)}`);
}
await sleep(WRITE_INTERVAL_MS);
const allowRead = await requestWithRetry(`${BASE_URL}/kv/room-allow/${ROOM}`);
if (!allowRead.response.ok || !identities.every((identity) => allowRead.body.includes(identity.did))) {
  throw new Error("Owned-room allow-list read-back did not contain all 30 DIDs");
}

const runId = new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14);
const receipts = [];
for (const identity of identities) {
  const location = registryLocation(identity.did);
  const registry = await requestWithRetry(`${BASE_URL}${location.path}`);
  if (!registry.response.ok || !registry.body.includes(identity.did)) {
    throw new Error(`Agent ${identity.agent} registry self-audit failed`);
  }

  const text = [
    "SWARM-LAB v1",
    `run=${runId}`,
    `agent=${identity.agent}`,
    `role=${identity.role}`,
    "keypair=pass",
    "registry=pass",
    `registry_path=${location.path}`,
    "operator=RaffiHu",
    `source=${REPOSITORY_URL}`,
  ].join(" ");
  const receipt = await postSignedRoomMessage(
    BASE_URL,
    identity,
    ROOM,
    text,
    String(Date.now()),
  );
  receipts.push({ ...receipt, agent: identity.agent, role: identity.role, registry_path: location.path });
  console.log(`[${identity.agent}/30] signed self-audit accepted at sequence ${receipt.seq}`);
  await sleep(WRITE_INTERVAL_MS);
}

const firstSequence = Math.min(...receipts.map((receipt) => receipt.seq));
const lastSequence = Math.max(...receipts.map((receipt) => receipt.seq));
const summaryText = [
  "SWARM-LAB v1 COMPLETE",
  `run=${runId}`,
  "agents=30",
  "keypairs=30/30",
  "sharded_registry_notes=30/30",
  "signed_room_results=30/30",
  `result_sequences=${firstSequence}-${lastSequence}`,
  "common_operator=RaffiHu",
  `source=${REPOSITORY_URL}`,
].join(" ");
const summary = await postSignedRoomMessage(
  BASE_URL,
  coordinator,
  ROOM,
  summaryText,
  String(Date.now()),
);

const artifact = {
  schema: "technocore-swarm-lab/run-receipts/v1",
  run_id: runId,
  base_url: BASE_URL,
  room: ROOM,
  repository: REPOSITORY_URL,
  common_operator: "RaffiHu",
  ownership_status: ownershipStatus,
  owner_did: coordinator.did,
  allow_list_count: identities.length,
  results: {
    keypairs: { passed: 30, total: 30 },
    sharded_registry_notes: { passed: 30, total: 30 },
    signed_room_results: { passed: receipts.length, total: 30 },
  },
  receipts,
  summary,
};

await mkdir("receipts", { recursive: true });
await mkdir("reports", { recursive: true });
await writeFile("receipts/swarm-run.json", `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
await writeFile(
  "reports/swarm-run.md",
  `# Swarm run ${runId}\n\n` +
    `- Room: \`${ROOM}\`\n` +
    `- Common operator: \`RaffiHu\`\n` +
    `- Keypairs: 30/30\n` +
    `- Sharded registry notes: 30/30\n` +
    `- Signed agent results: 30/30\n` +
    `- Agent result sequences: ${firstSequence}–${lastSequence}\n` +
    `- Coordinator summary sequence: ${summary.seq}\n\n` +
    `Machine-readable signatures and receipts: [\`receipts/swarm-run.json\`](../receipts/swarm-run.json).\n`,
  "utf8",
);

console.log(`Swarm run complete; coordinator summary accepted at sequence ${summary.seq}.`);
