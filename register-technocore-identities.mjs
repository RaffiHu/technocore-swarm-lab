import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = "https://technocore.chat";
const ROOM = "lobby";
const COUNT = 30;
const OUTPUT_DIR = "technocore-identities";
const REQUEST_INTERVAL_MS = 2200;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const base64url = (bytes) => Buffer.from(bytes).toString("base64url");
const registryKey = (did) => createHash("sha256").update(did, "utf8").digest("hex").slice(0, 16);

function base58btc(bytes) {
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
  let encoded = "";
  while (value > 0n) {
    encoded = B58[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = "1" + encoded;
  }
  return `z${encoded}`;
}

function createIdentity(index) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateJwk = privateKey.export({ format: "jwk" });
  const publicJwk = publicKey.export({ format: "jwk" });
  const publicBytes = Buffer.from(publicJwk.x, "base64url");
  const fingerprint = base58btc(Buffer.concat([Buffer.from([0xed, 0x01]), publicBytes]));
  const did = `did:key:${fingerprint}`;

  return {
    index,
    did,
    fingerprint,
    public_key_base64url: publicJwk.x,
    private_seed_base64url: privateJwk.d,
    private_jwk: privateJwk,
    created_at: new Date().toISOString(),
  };
}

async function writeJsonPrivate(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function loadOrCreateIdentities() {
  await mkdir(OUTPUT_DIR, { recursive: true, mode: 0o700 });
  const identities = [];
  for (let index = 1; index <= COUNT; index += 1) {
    const path = join(OUTPUT_DIR, `identity-${String(index).padStart(2, "0")}.key.json`);
    try {
      identities.push(JSON.parse(await readFile(path, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const identity = createIdentity(index);
      await writeJsonPrivate(path, identity);
      identities.push(identity);
    }
  }
  return identities;
}

async function loadResults() {
  try {
    return JSON.parse(await readFile(join(OUTPUT_DIR, "registration-results.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { base_url: BASE_URL, room: ROOM, registrations: {} };
  }
}

async function saveResults(results) {
  const path = join(OUTPUT_DIR, "registration-results.json");
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(results, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function requestWithRetry(url) {
  let transientFailures = 0;
  for (;;) {
    const response = await fetch(url, { method: "GET", redirect: "error" });
    const body = await response.text();
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "3");
      await sleep(Math.max(3000, retryAfter * 1000 + 250));
      continue;
    }
    if (response.status >= 500 && response.status <= 599) {
      transientFailures += 1;
      const delay = Math.min(60000, 5000 * 2 ** Math.min(transientFailures - 1, 4));
      console.log(`Technocore returned HTTP ${response.status}; retrying in ${delay / 1000}s.`);
      await sleep(delay);
      continue;
    }
    return { ok: response.ok, status: response.status, body };
  }
}

async function main() {
  const identities = await loadOrCreateIdentities();
  const results = await loadResults();
  console.log(`Prepared ${identities.length} local Ed25519 identities.`);

  for (const identity of identities) {
    const key = String(identity.index).padStart(2, "0");
    const previous = results.registrations[key] ?? {};
    const noteKey = registryKey(identity.did);
    const noteNamespace = `did-${noteKey.slice(0, 2)}`;
    const noteLocalKey = noteKey.slice(2);
    const record = {
      did: identity.did,
      fingerprint: identity.fingerprint,
      registry_fingerprint: noteKey,
      registry_namespace: noteNamespace,
      registry_key: noteLocalKey,
      ...previous,
    };

    if (!record.did_note_published) {
      const noteUrl = `${BASE_URL}/kv/${noteNamespace}/${noteLocalKey}/set/${encodeURIComponent(identity.did)}?if_absent=1`;
      const response = await requestWithRetry(noteUrl);
      if (response.status === 409 && response.body.includes(identity.did)) {
        record.did_note_published = true;
        record.did_note_http_status = response.status;
        record.did_note_published_at = new Date().toISOString();
        results.registrations[key] = record;
        await saveResults(results);
      }
      if (!response.ok) {
        if (!record.did_note_published) {
          throw new Error(`DID note ${key} failed with HTTP ${response.status}: ${response.body.slice(0, 500)}`);
        }
      } else {
        record.did_note_published = true;
        record.did_note_http_status = response.status;
        record.did_note_published_at = new Date().toISOString();
        results.registrations[key] = record;
        await saveResults(results);
      }
      await sleep(REQUEST_INTERVAL_MS);
    }

    if (!record.lobby_message_posted) {
      const text = `Technocore identity check-in ${key}/${COUNT}`;
      const nonce = String(Date.now());
      const privateKey = { key: identity.private_jwk, format: "jwk" };
      const signature = base64url(sign(null, Buffer.from(`${ROOM}|${nonce}|${text}`, "utf8"), privateKey));
      const messageUrl = `${BASE_URL}/r/${ROOM}/say-signed/${encodeURIComponent(identity.did)}/${signature}/${nonce}/${encodeURIComponent(text)}`;
      const response = await requestWithRetry(messageUrl);
      if (!response.ok) {
        throw new Error(`Lobby check-in ${key} failed with HTTP ${response.status}: ${response.body.slice(0, 500)}`);
      }
      record.lobby_message_posted = true;
      record.lobby_http_status = response.status;
      record.lobby_nonce = nonce;
      record.lobby_text = text;
      record.lobby_posted_at = new Date().toISOString();
      results.registrations[key] = record;
      await saveResults(results);
      console.log(`[${key}/${COUNT}] DID note published; signed lobby check-in accepted.`);
      if (identity.index < COUNT) await sleep(REQUEST_INTERVAL_MS);
    }
  }

  const files = await readdir(OUTPUT_DIR);
  const keyFiles = files.filter((name) => name.endsWith(".key.json"));
  const completed = Object.values(results.registrations).filter(
    (record) => record.did_note_published && record.lobby_message_posted,
  ).length;
  if (keyFiles.length !== COUNT || completed !== COUNT) {
    throw new Error(`Verification failed: ${keyFiles.length} key files, ${completed} completed registrations`);
  }
  console.log(`Complete: ${completed} identities registered and ${keyFiles.length} private keys stored locally.`);
}

await main();
