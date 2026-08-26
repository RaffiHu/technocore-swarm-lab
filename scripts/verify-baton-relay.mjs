import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { verifyPublicReceipt, verifyRelayArtifact } from "../lib/relay.mjs";

const manifestBytes = await readFile("agents.public.json");
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const artifact = JSON.parse(await readFile("receipts/baton-relay.json", "utf8"));
const currentManifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
const verification = verifyRelayArtifact(manifest, artifact);
if (artifact.manifest_sha256 !== currentManifestSha256) {
  verification.valid = false;
  verification.errors.push("public manifest hash does not match relay artifact");
}
let announcementVerified = false;
try {
  const announcement = JSON.parse(
    await readFile("receipts/baton-relay-announcement.json", "utf8"),
  );
  const announcingAgent = manifest.agents.find((agent) => agent.did === announcement.did);
  announcementVerified =
    verifyPublicReceipt(announcingAgent, announcement) &&
    announcement.text.includes(`final baton ${artifact.final_baton}`);
  if (!announcementVerified) {
    verification.valid = false;
    verification.errors.push("relay announcement signature or final-baton binding is invalid");
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
verification.announcement_verified = announcementVerified;

console.log(JSON.stringify(verification, null, 2));
if (!verification.valid) process.exitCode = 1;
