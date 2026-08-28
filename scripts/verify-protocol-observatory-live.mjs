import { readFile } from "node:fs/promises";
import { requestWithRetry } from "../lib/technocore.mjs";
import { normalizeObservedDocument, sha256Bytes } from "../lib/observatory.mjs";

const artifact = JSON.parse(await readFile("receipts/protocol-observatory.json", "utf8"));
const drift = [];
for (const expected of artifact.snapshot.documents) {
  const { response, body } = await requestWithRetry(
    `${artifact.snapshot.base_url}${expected.path}?n=${Date.now()}`,
  );
  const actual = {
    status: response.status,
    content_type: response.headers.get("content-type")?.split(";")[0] ?? null,
    bytes: Buffer.byteLength(body, "utf8"),
    sha256: sha256Bytes(Buffer.from(body, "utf8")),
  };
  const normalized = normalizeObservedDocument(expected.path, body);
  actual.semantic_sha256 = sha256Bytes(Buffer.from(normalized.body, "utf8"));
  for (const field of ["status", "content_type", "bytes", "semantic_sha256"]) {
    if (actual[field] !== expected[field]) {
      drift.push({ path: expected.path, field, expected: expected[field], actual: actual[field] });
    }
  }
}
const result = { unchanged: drift.length === 0, surfaces: artifact.snapshot.documents.length, drift };
console.log(JSON.stringify(result, null, 2));
if (!result.unchanged) process.exitCode = 1;
