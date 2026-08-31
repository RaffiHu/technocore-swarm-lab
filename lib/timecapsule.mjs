import { createHash } from "node:crypto";
import { verifyPublicReceipt } from "./relay.mjs";
import { sleep } from "./technocore.mjs";

export const sha256Export = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

export async function fetchRoomExportWithRetry(url, retries = 8) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, { redirect: "error" });
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "1");
      await response.arrayBuffer();
      await sleep(Math.max(1000, retryAfter * 1000, Math.min(8000, 1000 * 2 ** attempt)));
      continue;
    }
    return { response, bytes: Buffer.from(await response.arrayBuffer()) };
  }
}

export function collectArchivedReceipts({ swarm, baton, story, observatories }) {
  return [
    ...swarm.receipts,
    swarm.summary,
    ...baton.hops,
    baton.summary,
    ...story.hops,
    story.summary,
    ...observatories.map((artifact) => artifact.postcard),
  ].sort((left, right) => left.seq - right.seq);
}

export function parseJsonl(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  return lines.filter(Boolean).map((line) => JSON.parse(line));
}

const recordMatchesReceipt = (record, receipt) =>
  record.seq === receipt.seq &&
  record.ts === receipt.ts &&
  record.from === receipt.did &&
  record.text === receipt.text &&
  String(record.nonce) === String(receipt.nonce);

export function analyzeRoomExport(manifest, room, bytes, archivedReceipts) {
  const errors = [];
  const records = parseJsonl(bytes);
  const agentsByDid = new Map(manifest.agents.map((agent) => [agent.did, agent]));
  const receiptsBySequence = new Map(archivedReceipts.map((receipt) => [receipt.seq, receipt]));
  let matchedReceipts = 0;
  let verifiedArchivedSignatures = 0;
  let embeddedSignatures = 0;
  let verifiedEmbeddedSignatures = 0;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const expectedSequence = records[0].seq + index;
    if (record.seq !== expectedSequence) errors.push(`record ${index + 1}: non-contiguous sequence`);
    const agent = agentsByDid.get(record.from);
    if (!agent) errors.push(`sequence ${record.seq}: DID absent from public manifest`);
    const receipt = receiptsBySequence.get(record.seq);
    if (!receipt || !recordMatchesReceipt(record, receipt)) {
      errors.push(`sequence ${record.seq}: archived receipt mismatch`);
    } else {
      matchedReceipts += 1;
      if (verifyPublicReceipt(agent, receipt)) verifiedArchivedSignatures += 1;
      else errors.push(`sequence ${record.seq}: invalid archived signature`);
    }
    if (record.sig !== undefined) {
      embeddedSignatures += 1;
      const embeddedReceipt = {
        room,
        did: record.from,
        nonce: String(record.nonce),
        text: record.text,
        signature: record.sig,
      };
      if (verifyPublicReceipt(agent, embeddedReceipt)) verifiedEmbeddedSignatures += 1;
      else errors.push(`sequence ${record.seq}: invalid embedded signature`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    records: records.length,
    first_sequence: records[0]?.seq ?? null,
    last_sequence: records.at(-1)?.seq ?? null,
    matched_receipts: matchedReceipts,
    verified_archived_signatures: verifiedArchivedSignatures,
    embedded_signatures: embeddedSignatures,
    verified_embedded_signatures: verifiedEmbeddedSignatures,
    legacy_records_without_embedded_signature: records.length - embeddedSignatures,
    bytes: Buffer.byteLength(Buffer.from(bytes)),
    sha256: sha256Export(bytes),
  };
}

export function timeCapsuleSealText({ room, generation, analysis, source }) {
  return [
    "ROOM-TIME-CAPSULE v1",
    `room=${room}`,
    `generation=${generation}`,
    `sequences=${analysis.first_sequence}-${analysis.last_sequence}`,
    `records=${analysis.records}`,
    `bytes=${analysis.bytes}`,
    `sha256=${analysis.sha256}`,
    `receipt_matches=${analysis.matched_receipts}/${analysis.records}`,
    `archived_signatures=${analysis.verified_archived_signatures}/${analysis.records}`,
    `embedded_signatures=${analysis.verified_embedded_signatures}/${analysis.embedded_signatures}`,
    `legacy_without_sig=${analysis.legacy_records_without_embedded_signature}`,
    "common_operator=RaffiHu",
    `source=${source}`,
  ].join(" ");
}

export function verifyTimeCapsuleArtifact(manifest, artifact, bytes, archivedReceipts) {
  const analysis = analyzeRoomExport(manifest, artifact.room, bytes, archivedReceipts);
  const errors = [...analysis.errors];
  if (artifact.export.sha256 !== analysis.sha256) errors.push("artifact export hash mismatch");
  if (artifact.export.bytes !== analysis.bytes) errors.push("artifact export byte count mismatch");
  if (artifact.export.generation !== 0 && artifact.export.generation !== "0") {
    errors.push("unexpected nonzero generation for first room lifetime");
  }
  const coordinator = manifest.agents[0];
  if (artifact.seal.did !== coordinator.did) errors.push("seal is not signed by the coordinator");
  if (!verifyPublicReceipt(coordinator, artifact.seal)) errors.push("invalid time-capsule seal signature");
  const expectedText = timeCapsuleSealText({
    room: artifact.room,
    generation: artifact.export.generation,
    analysis,
    source: artifact.repository,
  });
  if (artifact.seal.text !== expectedText) errors.push("signed seal text mismatch");
  return { ...analysis, valid: errors.length === 0, errors, seal_sequence: artifact.seal.seq };
}
