import { readFile, writeFile } from 'node:fs/promises';
import { collectEvidence, checkEvidence, attestationText } from '../lib/referee.mjs';
import { deriveIdentity, signRoomMessage } from '../lib/technocore.mjs';

const args = process.argv.slice(2);
if (args.some(a => a !== '--capture')) throw new Error('Usage: bun run referee:live [--capture]');
const evidence = await collectEvidence();
const result = checkEvidence(evidence);
console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exitCode = 1;
else if (args.includes('--capture')) {
  const identity = JSON.parse(await readFile('technocore-identities/identity-01.key.json', 'utf8'));
  const manifest = JSON.parse(await readFile('agents.public.json', 'utf8'));
  if (deriveIdentity(identity.private_jwk).did !== identity.did || identity.did !== manifest.agents[0].did) throw new Error('Identity mismatch');
  const room = 'referee-evidence-v1', nonce = String(Date.now()), text = attestationText(evidence);
  const attestation = { room, nonce, text, did: identity.did, signature: signRoomMessage(identity, room, nonce, text) };
  // Never replace an earlier signed observation accidentally.
  await writeFile('receipts/referee-evidence.json', JSON.stringify({ evidence, attestation }, null, 2) + '\n', { flag: 'wx' });
  console.log('Saved locally signed evidence; no network writes.');
}
