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
import {
  relayBatonOut,
  relayGenesis,
  relayText,
  verifyPublicReceipt,
  verifyRelayArtifact,
} from "../lib/relay.mjs";
import {
  chooseStoryWord,
  storyGenesis,
  storyHashOut,
  storyText,
  verifyStoryArtifact,
} from "../lib/storychain.mjs";

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

test("builds a deterministic signed baton hop", () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const privateJwk = privateKey.export({ format: "jwk" });
  const derived = deriveIdentity(privateJwk);
  const identity = { did: derived.did, private_jwk: privateJwk };
  const agent = {
    agent: "01",
    role: "relay-tester",
    did: derived.did,
    public_key_base64url: derived.publicJwk.x,
  };
  const batonIn = relayGenesis("relay-test", "d-test", "a".repeat(64));
  const text = relayText({
    relayId: "relay-test",
    hop: 1,
    total: 1,
    agent,
    batonIn,
    source: "https://example.test/source",
  });
  const receipt = {
    room: "d-test",
    did: derived.did,
    nonce: "1002",
    text,
    signature: signRoomMessage(identity, "d-test", "1002", text),
    seq: 1,
    ts: "2026-08-26T00:00:00Z",
  };

  assert.equal(verifyPublicReceipt(agent, receipt), true);
  assert.match(relayBatonOut(batonIn, receipt), /^[0-9a-f]{64}$/);
});

test("verifies a complete relay and detects a tampered hop", () => {
  const room = "d-test-relay";
  const relayId = "relay-fixture";
  const manifestSha256 = "b".repeat(64);
  const privateIdentities = [];
  const agents = [];
  for (let index = 1; index <= 3; index += 1) {
    const { privateKey } = generateKeyPairSync("ed25519");
    const privateJwk = privateKey.export({ format: "jwk" });
    const derived = deriveIdentity(privateJwk);
    privateIdentities.push({ did: derived.did, private_jwk: privateJwk });
    agents.push({
      agent: String(index).padStart(2, "0"),
      role: `relay-fixture-${index}`,
      did: derived.did,
      public_key_base64url: derived.publicJwk.x,
    });
  }
  const manifest = { agents };
  let baton = relayGenesis(relayId, room, manifestSha256);
  const genesis = baton;
  const hops = [];
  for (let index = 0; index < agents.length; index += 1) {
    const text = relayText({
      relayId,
      hop: index + 1,
      total: agents.length,
      agent: agents[index],
      batonIn: baton,
      source: "https://example.test/relay",
    });
    const receipt = {
      room,
      did: agents[index].did,
      nonce: String(2000 + index),
      text,
      signature: signRoomMessage(privateIdentities[index], room, String(2000 + index), text),
      seq: 10 + index,
      ts: `2026-08-26T00:00:0${index}Z`,
      hop: index + 1,
      agent: agents[index].agent,
      role: agents[index].role,
      baton_in: baton,
    };
    receipt.baton_out = relayBatonOut(baton, receipt);
    baton = receipt.baton_out;
    hops.push(receipt);
  }
  const summaryText = `BATON-RELAY COMPLETE final_baton=${baton}`;
  const summary = {
    room,
    did: agents[0].did,
    nonce: "3000",
    text: summaryText,
    signature: signRoomMessage(privateIdentities[0], room, "3000", summaryText),
    seq: 13,
    ts: "2026-08-26T00:00:04Z",
  };
  const artifact = {
    relay_id: relayId,
    room,
    manifest_sha256: manifestSha256,
    genesis_baton: genesis,
    final_baton: baton,
    hops,
    summary,
  };

  assert.equal(verifyRelayArtifact(manifest, artifact).valid, true);
  const tampered = structuredClone(artifact);
  tampered.hops[1].text += " tampered";
  assert.equal(verifyRelayArtifact(manifest, tampered).valid, false);
});

test("builds and verifies a deterministic signed story chain", () => {
  const room = "d-story-test";
  const storyId = "2026-08-27";
  const manifestSha256 = "c".repeat(64);
  const privateIdentities = [];
  const agents = [];
  for (let index = 1; index <= 30; index += 1) {
    const { privateKey } = generateKeyPairSync("ed25519");
    const privateJwk = privateKey.export({ format: "jwk" });
    const derived = deriveIdentity(privateJwk);
    privateIdentities.push({ did: derived.did, private_jwk: privateJwk });
    agents.push({
      agent: String(index).padStart(2, "0"),
      role: `story-fixture-${index}`,
      did: derived.did,
      public_key_base64url: derived.publicJwk.x,
    });
  }
  const manifest = { agents };
  let hash = storyGenesis(storyId, room, manifestSha256);
  const words = [];
  const hops = [];
  for (let index = 0; index < agents.length; index += 1) {
    const word = chooseStoryWord({
      storyId,
      hop: index + 1,
      previousHash: hash,
      did: agents[index].did,
    });
    words.push(word);
    const story = words.join(" ");
    const text = storyText({
      storyId,
      hop: index + 1,
      total: agents.length,
      agent: agents[index],
      previousHash: hash,
      word,
      story,
      source: "https://example.test/story",
    });
    const receipt = {
      room,
      did: agents[index].did,
      nonce: String(4000 + index),
      text,
      signature: signRoomMessage(privateIdentities[index], room, String(4000 + index), text),
      seq: 100 + index,
      ts: `2026-08-27T00:00:${String(index).padStart(2, "0")}Z`,
      hop: index + 1,
      agent: agents[index].agent,
      word,
      story_so_far: story,
      previous_hash: hash,
    };
    receipt.hash_out = storyHashOut(hash, receipt);
    hash = receipt.hash_out;
    hops.push(receipt);
  }
  const finalStory = words.join(" ");
  const summaryText = `STORY-CHAIN COMPLETE final_hash=${hash} story="${finalStory}"`;
  const summary = {
    room,
    did: agents[0].did,
    nonce: "5000",
    text: summaryText,
    signature: signRoomMessage(privateIdentities[0], room, "5000", summaryText),
    seq: 130,
    ts: "2026-08-27T00:01:00Z",
  };
  const artifact = {
    story_id: storyId,
    room,
    repository: "https://example.test/story",
    manifest_sha256: manifestSha256,
    genesis_hash: storyGenesis(storyId, room, manifestSha256),
    final_hash: hash,
    final_story: finalStory,
    hops,
    summary,
  };

  assert.equal(verifyStoryArtifact(manifest, artifact).valid, true);
  const tampered = structuredClone(artifact);
  tampered.hops[12].word = "tampered";
  assert.equal(verifyStoryArtifact(manifest, tampered).valid, false);
});
