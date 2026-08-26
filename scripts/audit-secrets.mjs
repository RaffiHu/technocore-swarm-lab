import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspace = resolve(".");
const output = execFileSync(
  "git",
  [
    "-c",
    `safe.directory=${workspace.replaceAll("\\", "/")}`,
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
  ],
  { encoding: "utf8" },
);
const candidates = output.split(/\r?\n/).filter(Boolean);
const forbiddenPaths = candidates.filter((path) =>
  /(^|\/)(technocore-identities|\.env(?:\.|$))|\.(?:pem|seed|key|key\.json)$/i.test(path),
);

const knownSecrets = new Set();
for (let index = 1; index <= 30; index += 1) {
  const label = String(index).padStart(2, "0");
  const identity = JSON.parse(
    await readFile(`technocore-identities/identity-${label}.key.json`, "utf8"),
  );
  knownSecrets.add(identity.private_seed_base64url);
  knownSecrets.add(identity.private_jwk.d);
}

const secretHits = [];
const privateKeyHeader = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
for (const path of candidates) {
  const text = await readFile(path, "utf8").catch(() => "");
  for (const secret of knownSecrets) {
    if (secret && text.includes(secret)) secretHits.push(`${path}: exact private seed match`);
  }
  if (path !== "scripts/audit-secrets.mjs" && text.includes(privateKeyHeader)) {
    secretHits.push(`${path}: private-key PEM header`);
  }
}

const revisions = execFileSync(
  "git",
  ["-c", `safe.directory=${workspace.replaceAll("\\", "/")}`, "rev-list", "--all"],
  { encoding: "utf8" },
).split(/\r?\n/).filter(Boolean);
let historyBlobsScanned = 0;
for (const revision of revisions) {
  const paths = execFileSync(
    "git",
    [
      "-c",
      `safe.directory=${workspace.replaceAll("\\", "/")}`,
      "ls-tree",
      "-r",
      "--name-only",
      revision,
    ],
    { encoding: "utf8" },
  ).split(/\r?\n/).filter(Boolean);
  for (const path of paths) {
    historyBlobsScanned += 1;
    if (/(^|\/)(technocore-identities|\.env(?:\.|$))|\.(?:pem|seed|key|key\.json)$/i.test(path)) {
      secretHits.push(`${revision.slice(0, 12)}:${path}: forbidden historical path`);
      continue;
    }
    const content = execFileSync(
      "git",
      ["-c", `safe.directory=${workspace.replaceAll("\\", "/")}`, "show", `${revision}:${path}`],
      { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 },
    ).toString("utf8");
    for (const secret of knownSecrets) {
      if (secret && content.includes(secret)) {
        secretHits.push(`${revision.slice(0, 12)}:${path}: exact historical private seed match`);
      }
    }
  }
}

if (forbiddenPaths.length || secretHits.length) {
  console.error(JSON.stringify({ forbiddenPaths, secretHits }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      public_candidates_scanned: candidates.length,
      known_private_values_checked: knownSecrets.size,
      history_commits_scanned: revisions.length,
      history_blobs_scanned: historyBlobsScanned,
      forbidden_paths: 0,
      exact_secret_matches: 0,
      result: "pass",
    },
    null,
    2,
  ),
);
