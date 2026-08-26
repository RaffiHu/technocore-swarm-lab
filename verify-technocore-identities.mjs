import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const BASE_URL = "https://technocore.chat";
const OUTPUT_DIR = "technocore-identities";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function base58btc(bytes) {
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
  let encoded = "";
  while (value > 0n) {
    encoded = B58[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return `z${encoded}`;
}

async function getWithRetry(url) {
  for (;;) {
    const response = await fetch(url, { redirect: "error" });
    const body = await response.text();
    if (response.status === 429) {
      await sleep(Math.max(1000, Number(response.headers.get("retry-after") ?? 2) * 1000));
      continue;
    }
    if (response.status >= 500) {
      await sleep(3000);
      continue;
    }
    return { response, body };
  }
}

const files = (await readdir(OUTPUT_DIR))
  .filter((name) => /^identity-\d{2}\.key\.json$/.test(name))
  .sort();
const identities = await Promise.all(
  files.map(async (name) => JSON.parse(await readFile(`${OUTPUT_DIR}/${name}`, "utf8"))),
);
const results = JSON.parse(await readFile(`${OUTPUT_DIR}/registration-results.json`, "utf8"));

let validLocalKeys = 0;
let matchingNotes = 0;
let validLobbySignatures = 0;
for (const identity of identities) {
  const privateKey = createPrivateKey({ key: identity.private_jwk, format: "jwk" });
  const publicKey = createPublicKey(privateKey);
  const derivedPublicJwk = publicKey.export({ format: "jwk" });
  const fingerprint = base58btc(
    Buffer.concat([Buffer.from([0xed, 0x01]), Buffer.from(derivedPublicJwk.x, "base64url")]),
  );
  if (`did:key:${fingerprint}` === identity.did && derivedPublicJwk.x === identity.public_key_base64url) {
    validLocalKeys += 1;
  }

  const receipt = results.registrations[String(identity.index).padStart(2, "0")];
  const signedPayload = Buffer.from(`lobby|${receipt.lobby_nonce}|${receipt.lobby_text}`, "utf8");
  const signature = sign(null, signedPayload, privateKey);
  if (verify(null, signedPayload, publicKey, signature)) validLobbySignatures += 1;

  const registryFingerprint = createHash("sha256").update(identity.did).digest("hex").slice(0, 16);
  const url = `${BASE_URL}/kv/did-${registryFingerprint.slice(0, 2)}/${registryFingerprint.slice(2)}`;
  const { response, body } = await getWithRetry(url);
  if (response.ok && body.includes(identity.did)) matchingNotes += 1;
  await sleep(100);
}

const expectedMessages = new Map(
  Object.values(results.registrations).map((record) => [
    `${record.did}|${record.lobby_nonce}|${record.lobby_text}`,
    record.did,
  ]),
);
const foundMessages = new Set();
let since = 0;
for (let page = 0; page < 100 && foundMessages.size < expectedMessages.size; page += 1) {
  const { response, body } = await getWithRetry(
    `${BASE_URL}/r/lobby?format=json&limit=200&since=${since}&n=${Date.now()}`,
  );
  if (!response.ok) throw new Error(`Lobby read failed with HTTP ${response.status}`);
  const data = JSON.parse(body);
  if (!data.messages?.length) break;
  for (const message of data.messages) {
    const key = `${message.from}|${message.nonce}|${message.text}`;
    if (expectedMessages.has(key)) foundMessages.add(key);
  }
  const next = data.messages.at(-1).seq;
  if (next <= since) break;
  since = next;
  await sleep(100);
}

const completedReceipts = Object.values(results.registrations).filter(
  (record) => record.did_note_published && record.lobby_message_posted,
).length;

console.log(JSON.stringify({
  private_key_files: files.length,
  cryptographically_valid_keypairs: validLocalKeys,
  cryptographically_valid_lobby_signatures: validLobbySignatures,
  matching_sharded_registry_notes: matchingNotes,
  completed_local_receipts: completedReceipts,
  signed_lobby_messages_still_in_room_ring: foundMessages.size,
}, null, 2));

if (
  files.length !== 30 ||
  validLocalKeys !== 30 ||
  validLobbySignatures !== 30 ||
  matchingNotes !== 30 ||
  completedReceipts !== 30
) {
  process.exitCode = 1;
}
