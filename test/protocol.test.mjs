import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveIdentity,
  readRoom,
  registryLocation,
  signRoomMessage,
  verifyRoomMessage,
} from "../lib/technocore.mjs";

test("derives an Ed25519 did:key and verifies its room signature", () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const privateJwk = privateKey.export({ format: "jwk" });
  const derived = deriveIdentity(privateJwk);
  const identity = { did: derived.did, private_jwk: privateJwk };
  const signature = signRoomMessage(identity, "test-room", "1001", "hello");

  assert.match(derived.did, /^did:key:z6Mk/);
  assert.equal(signature.length, 86);
  assert.equal(verifyRoomMessage(identity, "test-room", "1001", "hello", signature), true);
  assert.equal(verifyRoomMessage(identity, "test-room", "1001", "changed", signature), false);
});

test("treats a missing room as an empty room for first-write receipt capture", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("room not found", { status: 404 });
  try {
    assert.deepEqual(await readRoom("https://example.test", "d-new-room"), {
      room: "d-new-room",
      count: 0,
      first_seq: null,
      last_seq: 0,
      messages: [],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the official sharded registry location", () => {
  const location = registryLocation(
    "did:key:z6Mknmc7ewqhv6taLXvMVYnDqeza3gTQpNxm6ZQWMyWrBLAT",
  );
  assert.equal(location.fingerprint, "e4673428003fc3a3");
  assert.equal(location.namespace, "did-e4");
  assert.equal(location.key, "673428003fc3a3");
  assert.equal(location.path, "/kv/did-e4/673428003fc3a3");
});
