import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
export const base64url = (bytes) => Buffer.from(bytes).toString("base64url");

export function base58btc(bytes) {
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
  let encoded = "";
  while (value > 0n) {
    encoded = BASE58_ALPHABET[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return `z${encoded}`;
}

export function deriveIdentity(privateJwk) {
  const privateKey = createPrivateKey({ key: privateJwk, format: "jwk" });
  const publicKey = createPublicKey(privateKey);
  const publicJwk = publicKey.export({ format: "jwk" });
  const fingerprint = base58btc(
    Buffer.concat([Buffer.from([0xed, 0x01]), Buffer.from(publicJwk.x, "base64url")]),
  );
  return {
    did: `did:key:${fingerprint}`,
    fingerprint,
    privateKey,
    publicKey,
    publicJwk,
  };
}

export function registryLocation(did) {
  const fingerprint = createHash("sha256").update(did, "utf8").digest("hex").slice(0, 16);
  return {
    fingerprint,
    namespace: `did-${fingerprint.slice(0, 2)}`,
    key: fingerprint.slice(2),
    path: `/kv/did-${fingerprint.slice(0, 2)}/${fingerprint.slice(2)}`,
  };
}

export function signRoomMessage(identity, room, nonce, text) {
  const privateKey = createPrivateKey({ key: identity.private_jwk, format: "jwk" });
  const payload = Buffer.from(`${room}|${nonce}|${text}`, "utf8");
  return base64url(sign(null, payload, privateKey));
}

export function verifyRoomMessage(didIdentity, room, nonce, text, signature) {
  const { publicKey } = deriveIdentity(didIdentity.private_jwk);
  const payload = Buffer.from(`${room}|${nonce}|${text}`, "utf8");
  return verify(null, payload, publicKey, Buffer.from(signature, "base64url"));
}

export function signOwnedNote(identity, namespace, key, nonce, value) {
  const privateKey = createPrivateKey({ key: identity.private_jwk, format: "jwk" });
  const payload = Buffer.from(`${namespace}|${key}|${nonce}|${value}`, "utf8");
  return base64url(sign(null, payload, privateKey));
}

export async function requestWithRetry(url, options = {}) {
  const { retries = 8, retryServerErrors = true } = options;
  let transientFailures = 0;
  for (;;) {
    const response = await fetch(url, { method: "GET", redirect: "error" });
    const body = await response.text();
    if (response.status === 429 && transientFailures < retries) {
      transientFailures += 1;
      const retryAfter = Number(response.headers.get("retry-after") ?? "3");
      await sleep(Math.max(3000, retryAfter * 1000 + 250));
      continue;
    }
    if (retryServerErrors && response.status >= 500 && transientFailures < retries) {
      transientFailures += 1;
      await sleep(Math.min(30000, 3000 * 2 ** Math.min(transientFailures - 1, 3)));
      continue;
    }
    return { response, body };
  }
}

export async function readRoom(baseUrl, room, since = undefined, limit = 200) {
  const query = new URLSearchParams({ format: "json", limit: String(limit), n: String(Date.now()) });
  if (since !== undefined) query.set("since", String(since));
  const { response, body } = await requestWithRetry(`${baseUrl}/r/${room}?${query}`);
  if (response.status === 404) {
    return { room, count: 0, first_seq: null, last_seq: 0, messages: [] };
  }
  if (!response.ok) throw new Error(`Room read failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

export async function postSignedRoomMessage(baseUrl, identity, room, text, nonce) {
  const before = await readRoom(baseUrl, room, undefined, 1);
  const previousSequence = before.last_seq ?? 0;
  const signature = signRoomMessage(identity, room, nonce, text);
  const url = `${baseUrl}/r/${room}/say-signed/${encodeURIComponent(identity.did)}/${signature}/${nonce}/${encodeURIComponent(text)}`;
  const { response, body } = await requestWithRetry(url);
  if (!response.ok) {
    throw new Error(`Signed room write failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const readback = await readRoom(baseUrl, room, previousSequence, 200);
    const message = readback.messages?.find(
      (candidate) =>
        candidate.from === identity.did &&
        String(candidate.nonce) === String(nonce) &&
        candidate.text === text,
    );
    if (message) {
      return {
        room,
        did: identity.did,
        nonce: String(nonce),
        text,
        signature,
        seq: message.seq,
        ts: message.ts,
        http_status: response.status,
      };
    }
    await sleep(500);
  }
  throw new Error("Signed write was accepted but its read-back receipt was not found");
}
