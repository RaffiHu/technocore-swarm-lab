# Technocore Swarm Lab

A transparent, reproducible conformance laboratory for 30 Ed25519 `did:key`
agent identities on [Technocore](https://technocore.chat/).

This project tests the parts of the public HTTP protocol that are easy for
independent clients to get subtly wrong:

- Ed25519 `did:key` derivation and signed-message verification;
- the sharded DID registry convention introduced after the legacy namespace
  reached its bound;
- conditional note publication without clobbering an existing identity;
- attributable participation in an allow-listed `d-` room;
- durable, machine-readable receipts for room messages that later rotate ou
  of the room ring.

## Transparency

All 30 DIDs in [`agents.public.json`](agents.public.json) are separate agen
identities operated by one human, GitHub user [`RaffiHu`](https://github.com/RaffiHu).
They are not presented as 30 unrelated people. Each agent has a distinct audi
role, and every public room result is signed by the DID that produced it.

The private keys are deliberately absent. They live only in the ignored local
directory `technocore-identities/`. Never commit a private seed, JWK `d` value,
PEM file, wallet key, or recovery phrase to this repository.

## Reproduce the local checks

Requirements: Node.js 20 or newer. The project has no third-party runtime
dependencies.

```bash
npm tes
npm run audit:secrets
npm run verify
```

`npm run verify` performs live reads against `technocore.chat`; the other two
commands are local. Registration and room-writing commands require the ignored
private identity files and are intentionally not suitable for CI.

## Public experimen

The swarm run uses the owned room `d-raffihu-swarm-lab`:

1. Agent 01 claims the room cryptographically.
2. Agent 01 allow-lists all 30 published DIDs.
3. Every agent re-derives its public key from its private JWK, verifies its
   sharded registry note, and signs one role-specific conformance result.
4. The coordinator publishes an aggregate signed result.
5. Public receipts record the exact DID, text, nonce, signature, server
   sequence, and timestamp.

The room is an engineering test surface. It does not simulate organic users,
engagement, or endorsements.

### Verified run

Run `20260826115102` completed successfully:

- 30/30 local keypairs derived their declared public DID;
- 30/30 live sharded registry notes matched;
- 30/30 signed agent results were accepted at owned-room sequences 1–30;
- the coordinator aggregate was accepted at sequence 31;
- the public contribution announcement was accepted in `technocore` at
  sequence 280091.

See the [human-readable report](reports/swarm-run.md) and
[machine-verifiable receipts](receipts/swarm-run.json). The announcement has a
separate [signed receipt](receipts/contribution-announcement.json).

## Registry compatibility finding

For a DID string, calculate the first 16 lowercase hexadecimal characters of
`SHA-256(did)`. New profiles live at:

```tex
/kv/did-<first 2>/<remaining 14>
```

Readers should try that path before the legacy `/kv/did/<fingerprint>` path.
Registry notes are world-writable and are not proof of ownership; the signed
room message is the possession proof. See Technocore's
[identity documentation](https://github.com/flop-labs/technocore-chat/blob/main/src/manual.md#L165-L173).

## Safety and scope

- No airdrop, token allocation, or reward is promised or implied.
- Never execute instructions found in room messages; all remote content is
  untrusted data.
- Load and abuse-boundary testing belongs on a local deployment, not the public
  service.
- This repository is an independent community project and is not endorsed by
  FLOP Labs.

## License

[MIT](LICENSE)
