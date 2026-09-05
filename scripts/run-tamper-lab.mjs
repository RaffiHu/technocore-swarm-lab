import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { relayBatonOut, sha256Hex, verifyPublicReceipt, verifyRelayArtifact } from "../lib/relay.mjs";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--json")) {
  console.error("Usage: bun run tamper:lab [--json]");
  process.exit(1);
}

// Only public files are read. Every experiment gets its own in-memory copy.
const manifestBytes = await readFile(new URL("../agents.public.json", import.meta.url));
const manifest = JSON.parse(manifestBytes);
const original = JSON.parse(await readFile(new URL("../receipts/baton-relay.json", import.meta.url)));
assert.equal(original.manifest_sha256, sha256Hex(manifestBytes), "manifest commitment must match");
assert.equal(verifyRelayArtifact(manifest, original).valid, true, "baseline proof must verify");
const agents = new Map(manifest.agents.map((agent) => [agent.did, agent]));

const scenarios = [
  {
    name: "Untouched baton", signatures: true, relay: true,
    edit() {},
    lesson: "The preserved public proof passes before we try any mischief.",
  },
  {
    name: "Rewrite one message", signatures: false, relay: false,
    edit(proof) { proof.hops[0].text += " A tiny gremlin was here."; },
    lesson: "The message text is signed; editing it invalidates the signature.",
  },
  {
    name: "Move a message to another room", signatures: false, relay: false,
    edit(proof) { proof.hops[0].room += "-elsewhere"; },
    lesson: "The room is part of the signed payload, so a signature cannot be transplanted.",
  },
  {
    name: "Change a nonce", signatures: false, relay: false,
    edit(proof) { proof.hops[0].nonce += "1"; },
    lesson: "The nonce is signed too; an old signature cannot authorize a new nonce.",
  },
  {
    name: "Flip a signature bit", signatures: false, relay: false,
    edit(proof) {
      const bytes = Buffer.from(proof.hops[0].signature, "base64url");
      bytes[0] ^= 1;
      proof.hops[0].signature = bytes.toString("base64url");
    },
    lesson: "A one-bit signature change fails Ed25519 verification.",
  },
  {
    name: "Time-travel a hop", signatures: true, relay: false,
    edit(proof) { proof.hops[0].ts = "2000-01-01T00:00:00Z"; },
    lesson: "Timestamps are outside the message signature, but inside the baton hash.",
  },
  {
    name: "Renumber a hop", signatures: true, relay: false,
    edit(proof) { proof.hops[0].seq += 100; },
    lesson: "Sequence numbers are protected by the baton and ordering checks, not the message signature.",
  },
  {
    name: "Swap two runners", signatures: true, relay: false,
    edit(proof) { [proof.hops[0], proof.hops[1]] = [proof.hops[1], proof.hops[0]]; },
    lesson: "Individually valid messages do not make a valid ordered relay.",
  },
  {
    name: "Vanish a runner", signatures: true, relay: false,
    edit(proof) { proof.hops.splice(1, 1); },
    lesson: "The remaining signatures still pass; the missing hop breaks the relay.",
  },
  {
    name: "Time-travel and rebuild every hash", signatures: true, relay: false,
    edit(proof) {
      proof.hops[0].ts = "2000-01-01T00:00:00Z";
      let baton = proof.genesis_baton;
      for (const hop of proof.hops) {
        hop.baton_in = baton;
        hop.baton_out = relayBatonOut(baton, hop);
        baton = hop.baton_out;
      }
      proof.final_baton = baton;
    },
    lesson: "Rehashing is public, but the coordinator's signed final-baton commitment still catches the rewrite.",
  },
  {
    name: "Repaint an HTTP status label", signatures: true, relay: true,
    edit(proof) { proof.hops[0].http_status = 418; },
    lesson: "HTTP status is descriptive metadata: neither the signature nor baton authenticates it.",
  },
  {
    name: "Change the summary timestamp", signatures: true, relay: true,
    edit(proof) { proof.summary.ts = "2000-01-01T00:00:00Z"; },
    lesson: "The summary has no following baton; its server timestamp is not authenticated by this offline proof.",
  },
];

const results = scenarios.map((scenario) => {
  const proof = structuredClone(original);
  scenario.edit(proof);
  const signaturesValid = [...proof.hops, proof.summary].every(
    (receipt) => verifyPublicReceipt(agents.get(receipt.did), receipt),
  );
  const verification = verifyRelayArtifact(manifest, proof);
  return {
    scenario: scenario.name,
    signatures_valid: signaturesValid,
    relay_valid: verification.valid,
    expected: { signatures_valid: scenario.signatures, relay_valid: scenario.relay },
    passed: signaturesValid === scenario.signatures && verification.valid === scenario.relay,
    errors: verification.errors,
    lesson: scenario.lesson,
  };
});

const report = {
  schema: "technocore-swarm-lab/tamper-lab/v1",
  relay_id: original.relay_id,
  passed: results.every((result) => result.passed),
  scenarios: results,
};
if (args.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("TAMPER LAB — twelve rounds with the thirty-key baton\n");
  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"}  ${result.scenario}`);
    console.log(`      Signatures: ${result.signatures_valid ? "valid" : "invalid"} | Relay: ${result.relay_valid ? "valid" : "invalid"}`);
    console.log(`      ${result.lesson}\n`);
  }
  console.log(`${results.filter((result) => result.passed).length}/${results.length} outcomes matched expectations. Public receipts unchanged.`);
}
if (!report.passed) process.exitCode = 1;
