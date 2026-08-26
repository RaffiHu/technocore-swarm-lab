import { createHash, createPublicKey, verify } from "node:crypto";

export const sha256Hex = (value) =>
  createHash("sha256").update(value).digest("hex");

export function publicKeyFromAgent(agent) {
  return createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: agent.public_key_base64url },
    format: "jwk",
  });
}

export function verifyPublicReceipt(agent, receipt) {
  if (!agent || agent.did !== receipt.did) return false;
  const payload = Buffer.from(
    `${receipt.room}|${receipt.nonce}|${receipt.text}`,
    "utf8",
  );
  return verify(
    null,
    payload,
    publicKeyFromAgent(agent),
    Buffer.from(receipt.signature, "base64url"),
  );
}

export function relayGenesis(relayId, room, manifestSha256) {
  return sha256Hex(
    `technocore-swarm-lab|baton-relay-v1|${relayId}|${room}|${manifestSha256}`,
  );
}

export function relayBatonOut(batonIn, receipt) {
  return sha256Hex(
    [
      "technocore-swarm-lab",
      "baton-relay-v1",
      batonIn,
      receipt.did,
      receipt.nonce,
      receipt.text,
      receipt.signature,
      receipt.seq,
      receipt.ts,
    ].join("|"),
  );
}

export function relayText({ relayId, hop, total, agent, batonIn, source }) {
  return [
    "BATON-RELAY v1",
    `relay=${relayId}`,
    `hop=${String(hop).padStart(2, "0")}/${total}`,
    `agent=${agent.agent}`,
    `role=${agent.role}`,
    `baton_in=${batonIn}`,
    "action=verified-and-forwarded",
    "operator=RaffiHu",
    `source=${source}`,
  ].join(" ");
}

export function verifyRelayArtifact(manifest, artifact) {
  const errors = [];
  const agentsByDid = new Map(manifest.agents.map((agent) => [agent.did, agent]));
  let expectedBaton = relayGenesis(
    artifact.relay_id,
    artifact.room,
    artifact.manifest_sha256,
  );
  let previousSequence = 0;

  if (artifact.hops.length !== manifest.agents.length) {
    errors.push(`expected ${manifest.agents.length} hops, got ${artifact.hops.length}`);
  }

  for (let index = 0; index < artifact.hops.length; index += 1) {
    const hop = artifact.hops[index];
    const expectedAgent = manifest.agents[index];
    if (hop.hop !== index + 1) errors.push(`hop ${index + 1}: wrong hop number`);
    if (hop.agent !== expectedAgent?.agent) errors.push(`hop ${index + 1}: wrong agent label`);
    if (hop.did !== expectedAgent?.did) errors.push(`hop ${index + 1}: wrong DID order`);
    if (hop.baton_in !== expectedBaton) errors.push(`hop ${index + 1}: broken baton input`);
    if (!verifyPublicReceipt(agentsByDid.get(hop.did), hop)) {
      errors.push(`hop ${index + 1}: invalid room signature`);
    }
    const computedOut = relayBatonOut(hop.baton_in, hop);
    if (hop.baton_out !== computedOut) errors.push(`hop ${index + 1}: wrong baton output`);
    if (previousSequence && hop.seq !== previousSequence + 1) {
      errors.push(`hop ${index + 1}: non-contiguous room sequence`);
    }
    expectedBaton = computedOut;
    previousSequence = hop.seq;
  }

  if (artifact.final_baton !== expectedBaton) errors.push("final baton mismatch");
  if (!verifyPublicReceipt(agentsByDid.get(artifact.summary.did), artifact.summary)) {
    errors.push("invalid coordinator summary signature");
  }
  if (!artifact.summary.text.includes(`final_baton=${artifact.final_baton}`)) {
    errors.push("coordinator summary does not bind the final baton");
  }

  return {
    valid: errors.length === 0,
    errors,
    verified_hops: artifact.hops.length - errors.filter((error) => error.includes("signature")).length,
    total_hops: artifact.hops.length,
    final_baton: expectedBaton,
  };
}
