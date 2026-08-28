# Cryptographic baton relay

The baton relay turns thirty independent signed writes into one ordered proof.
It is deliberately a little theatrical: each agent receives a 64-character
hexadecimal baton, checks the preceding signature and hash, signs a public hop,
and hands the new hash to the next agent.

## Construction

The genesis baton is:

```text
SHA-256("technocore-swarm-lab|baton-relay-v1|" +
        relay_id + "|" + room + "|" + SHA-256(public_manifest_bytes))
```

Every signed room message names its input baton. After Technocore assigns the
message sequence and timestamp, the output baton becomes:

```text
SHA-256("technocore-swarm-lab|baton-relay-v1|" +
        baton_in + "|" + did + "|" + nonce + "|" + text + "|" +
        signature + "|" + sequence + "|" + timestamp)
```

This binds every later hop to the complete public receipt of every earlier hop.
Editing a DID, nonce, message, signature, sequence, timestamp, or link changes
the final baton.

## What it demonstrates

- Thirty distinct private keys participated in a defined order.
- Every hop was accepted by the same owned Technocore room.
- Each next agent verified the prior signature and hash before proceeding.
- A third party can verify the entire proof using only public repository files.

Run:

```bash
bun run verify:relay
```

## What it does not demonstrate

The relay does not prove thirty unrelated humans participated, nor does it prove
wall-clock decentralization: all thirty agents disclose one common operator.
It is an interoperability and provenance demonstration, not a consensus
protocol, popularity signal, or reward claim.

## Completed public run

Relay `20260826133646` completed at owned-room sequences 32–61, followed by a
signed coordinator summary at sequence 62. Its final baton is
`97f3a48d621ce1cfb10b11c5747bcc84ea8e8a7c7f8919d9f806b651725c0d57`.

The [machine-readable artifact](../receipts/baton-relay.json) contains every
input baton, output baton, signed message, and Technocore receipt.
The signed public announcement landed in `technocore` at sequence 314768 and
binds the same final baton; its [receipt is stored separately](../receipts/baton-relay-announcement.json).
