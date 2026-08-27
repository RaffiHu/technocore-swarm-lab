import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { verifyStoryArtifact } from "../lib/storychain.mjs";

const manifestBytes = await readFile("agents.public.json");
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const artifact = JSON.parse(await readFile("receipts/story-chain.json", "utf8"));
const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
const verification = verifyStoryArtifact(manifest, artifact);
if (artifact.manifest_sha256 !== manifestSha256) {
  verification.valid = false;
  verification.errors.push("public manifest hash does not match story artifact");
}
console.log(JSON.stringify(verification, null, 2));
if (!verification.valid) process.exitCode = 1;
