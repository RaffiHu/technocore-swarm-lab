import { sha256Hex, verifyPublicReceipt } from './relay.mjs';

export const ORIGIN = 'https://technocore.chat';
export const LAB = 'd-raffihu-swarm-lab';
export const SCHEMA = 'technocore-swarm-lab/referee-evidence/v1';
export const CASES = [
  { id: 'zero', path: `/r/${LAB}?format=json&limit=0`, status: 200, count: 1 },
  { id: 'zero-backtick', path: `/r/${LAB}?format=json&limit=0%60`, status: 200, count: 50 },
  { id: 'one', path: `/r/${LAB}?format=json&limit=1`, status: 200, count: 1 },
  { id: 'one-backtick', path: `/r/${LAB}?format=json&limit=1%60`, status: 200, count: 50 },
  { id: 'manual', path: '/llms.txt', status: 200 },
  { id: 'manual-backtick', path: '/llms.txt%60', status: 404 },
];

// Preserve object-key ordering explicitly; array order remains significant.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export const evidenceHash = evidence => sha256Hex(canonical(evidence));
export const attestationText = evidence => `REFEREE-EVIDENCE v1 sha256=${evidenceHash(evidence)}`;

export function requestWarnings(url) {
  const warnings = [];
  if (/`|%60/i.test(url)) warnings.push('literal or encoded Markdown backtick: confirm intended request; do not silently strip');
  return warnings;
}

export function checkEvidence(evidence) {
  const errors = [];
  if (evidence.schema !== SCHEMA) errors.push('wrong schema');
  if (!Array.isArray(evidence.cases) || evidence.cases.length !== CASES.length) {
    return { valid: false, errors: [...errors, 'wrong case count'] };
  }
  for (const [i, spec] of CASES.entries()) {
    const record = evidence.cases[i];
    const fail = message => errors.push(`${spec.id}: ${message}`);
    if (record.id !== spec.id || record.method !== 'GET' || record.url !== ORIGIN + spec.path) fail('request differs from fixed test');
    if (record.status !== spec.status) fail(`expected HTTP ${spec.status}, got ${record.status}`);
    const body = Buffer.from(record.body_base64 ?? '', 'base64');
    if (body.toString('base64') !== record.body_base64) fail('noncanonical response encoding');
    if (body.length !== record.bytes || sha256Hex(body) !== record.sha256) fail('response bytes/hash mismatch');
    if (!Number.isFinite(Date.parse(record.observed_at))) fail('invalid observation time');
    if (spec.count !== undefined) {
      try {
        const parsed = JSON.parse(body.toString('utf8'));
        if (parsed.room !== LAB || parsed.count !== spec.count || parsed.messages?.length !== spec.count) fail(`expected ${spec.count} lab messages`);
      } catch { fail('invalid JSON response'); }
    } else if (spec.id === 'manual' && !body.toString('utf8').includes('PARAMETERS:')) {
      fail('expected Technocore manual');
    }
  }
  return { valid: !errors.length, errors, checked_cases: CASES.length };
}

export function verifyEvidenceArtifact(manifest, artifact) {
  const result = checkEvidence(artifact.evidence);
  const errors = [...result.errors];
  const receipt = artifact.attestation;
  const agent = manifest.agents.find(a => a.did === receipt?.did);
  try {
    if (receipt?.room !== 'referee-evidence-v1' || receipt.text !== attestationText(artifact.evidence) ||
        !verifyPublicReceipt(agent, receipt)) errors.push('invalid evidence attestation');
  } catch { errors.push('invalid evidence attestation'); }
  return { ...result, valid: !errors.length, errors, evidence_sha256: evidenceHash(artifact.evidence) };
}

// Only caller-selected fixed paths above are fetched, never paths in input artifacts.
export async function collectEvidence() {
  const cases = [];
  for (const spec of CASES) {
    const url = ORIGIN + spec.path;
    let record;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
      const body = Buffer.from(await response.arrayBuffer());
      record = {
        id: spec.id, method: 'GET', url, observed_at: new Date().toISOString(),
        status: response.status, content_type: response.headers.get('content-type'),
        cache_control: response.headers.get('cache-control'), bytes: body.length,
        sha256: sha256Hex(body), body_base64: body.toString('base64'), attempts: attempt + 1,
      };
      if (response.status !== 429 && response.status < 500) break;
      const delay = Math.min(30000, Math.max(2000, Number(response.headers.get('retry-after') || 2) * 1000));
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, delay));
    }
    cases.push(record);
    console.log(`${spec.id}: HTTP ${record.status}; ${record.bytes} bytes`);
  }
  return {
    schema: SCHEMA, captured_at: new Date().toISOString(), common_operator: 'RaffiHu',
    scope: 'Read-only controlled reproduction in our own room; not a reconstruction of another agent execution.',
    cases,
  };
}
