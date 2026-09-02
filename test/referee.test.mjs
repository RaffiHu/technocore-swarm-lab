import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { CASES, ORIGIN, LAB, SCHEMA, canonical, requestWarnings, attestationText, verifyEvidenceArtifact } from '../lib/referee.mjs';
import { sha256Hex } from '../lib/relay.mjs';
import { deriveIdentity, signRoomMessage } from '../lib/technocore.mjs';

function fixture() {
  const jwk = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
  const derived = deriveIdentity(jwk);
  const identity = { did: derived.did, private_jwk: jwk };
  const manifest = { agents: [{ did: identity.did, public_key_base64url: derived.publicJwk.x }] };
  const evidence = { schema: SCHEMA, cases: CASES.map(spec => {
    const body = Buffer.from(spec.count ? JSON.stringify({room: LAB, count: spec.count, messages: Array(spec.count).fill({})}) : spec.id === 'manual' ? 'PARAMETERS: fixture' : 'not found');
    return { id: spec.id, method: 'GET', url: ORIGIN + spec.path, status: spec.status, observed_at: '2026-09-02T00:00:00Z', bytes: body.length, sha256: sha256Hex(body), body_base64: body.toString('base64') };
  }) };
  const room = 'referee-evidence-v1', nonce = '1', text = attestationText(evidence);
  return { manifest, artifact: { evidence, attestation: { room, nonce, text, did: identity.did, signature: signRoomMessage(identity, room, nonce, text) } } };
}
test('referee verifies signed response evidence offline', () => {
  const { manifest, artifact } = fixture();
  assert.equal(verifyEvidenceArtifact(manifest, artifact).valid, true);
});
test('referee rejects altered URL, body, status, signature and missing case', () => {
  for (const mutate of [
    a => a.evidence.cases[0].url += '%60',
    a => a.evidence.cases[0].body_base64 = Buffer.from('{}').toString('base64'),
    a => a.evidence.cases[0].status = 503,
    a => a.attestation.signature = 'A'.repeat(86),
    a => a.evidence.cases.pop(),
    a => a.evidence.cases[0].url = 'https://example.com/steal',
  ]) {
    const { manifest, artifact } = fixture(); mutate(artifact);
    assert.equal(verifyEvidenceArtifact(manifest, artifact).valid, false);
  }
});
test('referee flags encoded and literal backticks without repairing the URL', () => {
  assert.equal(requestWarnings(ORIGIN + '/llms.txt%60').length, 1);
  assert.equal(requestWarnings(ORIGIN + '/llms.txt`').length, 1);
  assert.equal(requestWarnings(ORIGIN + '/llms.txt').length, 0);
});
test('canonical evidence ignores object key ordering but preserves array ordering', () => {
  assert.equal(canonical({b: 1, a: [1,2]}), canonical({a: [1,2], b: 1}));
  assert.notEqual(canonical([1,2]), canonical([2,1]));
});
