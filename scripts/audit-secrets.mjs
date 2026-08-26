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
  try {
    const identity = JSON.parse(
      await readFile(`technocore-identities/identity-${label}.key.json`, "utf8"),
    );
    knownSecrets.add(identity.private_seed_base64url);
    knownSecrets.add(identity.private_jwk.d);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const secretHits = [];
const genericPatterns = [
  ["private-key PEM block", new RegExp(["-{5}BEGIN ", "(?:RSA |EC |OPENSSH )?", "PRIVATE KEY-{5}"].join(""))],
  ["GitHub access token", new RegExp(["gh", "[pousr]_[A-Za-z0-9]{20,}"].join(""))],
  ["AWS access key", new RegExp(["AK", "IA[0-9A-Z]{16}"].join(""))],
  ["long sk-prefixed API token", new RegExp(["s", "k-[A-Za-z0-9_-]{32,}"].join(""))],
];
for (const path of candidates) {
  const text = await readFile(path, "utf8").catch(() => "");
  for (const secret of knownSecrets) {
    if (secret && text.includes(secret)) secretHits.push(`${path}: exact private seed match`);
  }
  for (const [label, pattern] of genericPatterns) {
    if (pattern.test(text)) secretHits.push(`${path}: ${label}`);
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
    for (const [label, pattern] of genericPatterns) {
      if (pattern.test(content)) {
        secretHits.push(`${revision.slice(0, 12)}:${path}: historical ${label}`);
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
      generic_credential_matches: 0,
      result: "pass",
    },
    null,
    2,
  ),
);
