import { sha256Hex, verifyPublicReceipt } from "./relay.mjs";

export const WORD_CHOICES = [
  ["At", "Beyond", "Near"],
  ["moonrise,", "midnight,", "daybreak,"],
  ["thirty"],
  ["curious", "brave", "playful"],
  ["agents"],
  ["carried", "passed", "rolled"],
  ["a"],
  ["luminous", "golden", "sparkling"],
  ["signal"],
  ["through", "across", "around"],
  ["the"],
  ["quiet", "electric", "waking"],
  ["network,"],
  ["discovering", "learning", "proving"],
  ["that"],
  ["trust"],
  ["grows", "glows", "deepens"],
  ["when"],
  ["every"],
  ["voice", "key", "signer"],
  ["verifies", "honors", "remembers"],
  ["the"],
  ["one", "hop", "hand"],
  ["before"],
  ["it"],
  ["and"],
  ["leaves", "sends", "kindles"],
  ["a"],
  ["light", "spark", "trace"],
  ["behind."],
];

export function storyGenesis(storyId, room, manifestSha256) {
  return sha256Hex(
    `technocore-swarm-lab|story-chain-v1|${storyId}|${room}|${manifestSha256}`,
  );
}

export function chooseStoryWord({ storyId, hop, previousHash, did }) {
  const choices = WORD_CHOICES[hop - 1];
  if (!choices) throw new Error(`No word choices for hop ${hop}`);
  const digest = sha256Hex(`story-chain-v1|${storyId}|${hop}|${previousHash}|${did}`);
  return choices[Number.parseInt(digest.slice(0, 8), 16) % choices.length];
}

export function storyHashOut(previousHash, receipt) {
  return sha256Hex(
    [
      "technocore-swarm-lab",
      "story-chain-v1",
      previousHash,
      receipt.did,
      receipt.nonce,
      receipt.text,
      receipt.signature,
      receipt.seq,
      receipt.ts,
    ].join("|"),
  );
}

export function storyText({ storyId, hop, total, agent, previousHash, word, story, source }) {
  return [
    "STORY-CHAIN v1",
    `story=${storyId}`,
    `hop=${String(hop).padStart(2, "0")}/${total}`,
    `agent=${agent.agent}`,
    `previous=${previousHash}`,
    `word=${word}`,
    `story_so_far=${story}`,
    "operator=RaffiHu",
    `source=${source}`,
  ].join(" ");
}

export function verifyStoryArtifact(manifest, artifact) {
  const errors = [];
  const agentsByDid = new Map(manifest.agents.map((agent) => [agent.did, agent]));
  let expectedHash = storyGenesis(
    artifact.story_id,
    artifact.room,
    artifact.manifest_sha256,
  );
  const words = [];
  let previousSequence = 0;

  if (artifact.genesis_hash !== expectedHash) errors.push("genesis hash mismatch");

  if (artifact.hops.length !== WORD_CHOICES.length) {
    errors.push(`expected ${WORD_CHOICES.length} hops, got ${artifact.hops.length}`);
  }

  for (let index = 0; index < artifact.hops.length; index += 1) {
    const hop = artifact.hops[index];
    const agent = manifest.agents[index];
    const expectedWord = chooseStoryWord({
      storyId: artifact.story_id,
      hop: index + 1,
      previousHash: expectedHash,
      did: agent?.did,
    });
    words.push(expectedWord);
    const expectedStory = words.join(" ");
    const expectedText = storyText({
      storyId: artifact.story_id,
      hop: index + 1,
      total: manifest.agents.length,
      agent,
      previousHash: expectedHash,
      word: expectedWord,
      story: expectedStory,
      source: artifact.repository,
    });

    if (hop.hop !== index + 1) errors.push(`hop ${index + 1}: wrong hop number`);
    if (hop.did !== agent?.did) errors.push(`hop ${index + 1}: wrong DID order`);
    if (hop.room !== artifact.room) errors.push(`hop ${index + 1}: wrong room`);
    if (hop.previous_hash !== expectedHash) errors.push(`hop ${index + 1}: broken hash input`);
    if (hop.word !== expectedWord) errors.push(`hop ${index + 1}: wrong deterministic word`);
    if (hop.story_so_far !== expectedStory) errors.push(`hop ${index + 1}: wrong story prefix`);
    if (hop.text !== expectedText) errors.push(`hop ${index + 1}: signed text mismatch`);
    if (!verifyPublicReceipt(agentsByDid.get(hop.did), hop)) {
      errors.push(`hop ${index + 1}: invalid room signature`);
    }
    const computedOut = storyHashOut(hop.previous_hash, hop);
    if (hop.hash_out !== computedOut) errors.push(`hop ${index + 1}: wrong hash output`);
    if (previousSequence && hop.seq !== previousSequence + 1) {
      errors.push(`hop ${index + 1}: non-contiguous room sequence`);
    }
    expectedHash = computedOut;
    previousSequence = hop.seq;
  }

  const story = words.join(" ");
  if (artifact.final_hash !== expectedHash) errors.push("final hash mismatch");
  if (artifact.final_story !== story) errors.push("final story mismatch");
  const coordinator = agentsByDid.get(artifact.summary.did);
  if (artifact.summary.did !== manifest.agents[0]?.did) {
    errors.push("summary is not signed by the coordinator");
  }
  if (artifact.summary.room !== artifact.room) errors.push("summary has wrong room");
  if (previousSequence && artifact.summary.seq !== previousSequence + 1) {
    errors.push("summary sequence is not contiguous");
  }
  if (!verifyPublicReceipt(coordinator, artifact.summary)) {
    errors.push("invalid coordinator summary signature");
  }
  if (!artifact.summary.text.includes(`final_hash=${artifact.final_hash}`)) {
    errors.push("summary does not bind the final hash");
  }
  if (!artifact.summary.text.includes(`story=\"${artifact.final_story}\"`)) {
    errors.push("summary does not bind the final story");
  }

  return {
    valid: errors.length === 0,
    errors,
    verified_hops: artifact.hops.length - errors.filter((error) => error.includes("signature")).length,
    total_hops: artifact.hops.length,
    final_hash: expectedHash,
    story,
  };
}
