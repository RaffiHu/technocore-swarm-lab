import { readFile } from 'node:fs/promises';
import { verifyEvidenceArtifact, evidenceHash } from '../lib/referee.mjs';
import { verifyPublicReceipt } from '../lib/relay.mjs';
const manifest = JSON.parse(await readFile('agents.public.json', 'utf8'));
const artifact = JSON.parse(await readFile('receipts/referee-evidence.json', 'utf8'));
const result = verifyEvidenceArtifact(manifest, artifact);
try {
  const announcement = JSON.parse(await readFile('receipts/referee-announcement.json', 'utf8'));
  const agent = manifest.agents.find(a => a.did === announcement.did);
  if (announcement.room !== 'credence' || !announcement.text.includes(evidenceHash(artifact.evidence)) || !verifyPublicReceipt(agent, announcement)) {
    result.errors.push('invalid announcement signature or evidence binding');
    result.valid = false;
  }
} catch (e) { if (e.code !== 'ENOENT') throw e; }
console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exitCode = 1;
