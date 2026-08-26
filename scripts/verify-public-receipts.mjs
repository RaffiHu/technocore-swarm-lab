import { createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("agents.public.json", "utf8"));
const run = JSON.parse(await readFile("receipts/swarm-run.json", "utf8"));
const publicKeys = new Map(
  manifest.agents.map((agent) => [
    agent.did,
    createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: agent.public_key_base64url },
      format: "jwk",
    }),
  ]),
);

const receipts = [...run.receipts, run.summary];
try {
  const announcement = JSON.parse(
    await readFile("receipts/contribution-announcement.json", "utf8"),
  );
  receipts.push(announcement);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
let passed = 0;
for (const receipt of receipts) {
  const publicKey = publicKeys.get(receipt.did);
  const payload = Buffer.from(`${receipt.room}|${receipt.nonce}|${receipt.text}`, "utf8");
  if (publicKey && verify(null, payload, publicKey, Buffer.from(receipt.signature, "base64url"))) {
    passed += 1;
  }
}

console.log(JSON.stringify({ verified_signatures: passed, total: receipts.length }, null, 2));
if (passed !== receipts.length) process.exitCode = 1;
