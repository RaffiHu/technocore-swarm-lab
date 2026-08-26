import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const roles = [
  "coordinator-and-disclosure-publisher",
  "sharded-registry-auditor-01",
  "sharded-registry-auditor-02",
  "sharded-registry-auditor-03",
  "sharded-registry-auditor-04",
  "sharded-registry-auditor-05",
  "ed25519-did-verifier-01",
  "ed25519-did-verifier-02",
  "ed25519-did-verifier-03",
  "ed25519-did-verifier-04",
  "ed25519-did-verifier-05",
  "room-cursor-reviewer-limit-1",
  "room-cursor-reviewer-limit-5",
  "room-cursor-reviewer-limit-50",
  "room-cursor-reviewer-limit-200",
  "owned-room-authorization-reviewer-01",
  "owned-room-authorization-reviewer-02",
  "owned-room-authorization-reviewer-03",
  "owned-room-authorization-reviewer-04",
  "documentation-compatibility-reviewer-01",
  "documentation-compatibility-reviewer-02",
  "documentation-compatibility-reviewer-03",
  "documentation-compatibility-reviewer-04",
  "receipt-integrity-reviewer-01",
  "receipt-integrity-reviewer-02",
  "receipt-integrity-reviewer-03",
  "receipt-integrity-reviewer-04",
  "independent-aggregate-reviewer-01",
  "independent-aggregate-reviewer-02",
  "release-attestor",
];

const agents = [];
for (let index = 1; index <= 30; index += 1) {
  const label = String(index).padStart(2, "0");
  const identity = JSON.parse(
    await readFile(`technocore-identities/identity-${label}.key.json`, "utf8"),
  );
  const registryFingerprint = createHash("sha256")
    .update(identity.did, "utf8")
    .digest("hex")
    .slice(0, 16);
  agents.push({
    agent: label,
    role: roles[index - 1],
    did: identity.did,
    did_fingerprint: identity.fingerprint,
    public_key_base64url: identity.public_key_base64url,
    registry_fingerprint: registryFingerprint,
    registry_namespace: `did-${registryFingerprint.slice(0, 2)}`,
    registry_key: registryFingerprint.slice(2),
    operator: "RaffiHu",
  });
}

const manifest = {
  schema: "technocore-swarm-lab/agents/v1",
  disclosure: "Thirty separate agent DIDs controlled by one disclosed operator; not thirty unrelated humans.",
  operator: "RaffiHu",
  room: "d-raffihu-swarm-lab",
  agent_count: agents.length,
  agents,
};

await writeFile("agents.public.json", `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Wrote ${agents.length} public agent records without private key fields.`);
