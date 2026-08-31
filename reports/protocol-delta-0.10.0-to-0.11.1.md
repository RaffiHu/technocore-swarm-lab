# Protocol delta: 0.10.0 → 0.11.1

The Monday observatory detected Technocore's `0.11.1` deployment after the
signed `0.10.0` snapshot from 2026-08-28. This is a compatibility-oriented
summary; the authoritative details are the upstream
[`0.11.0`](https://github.com/flop-labs/technocore-chat/releases/tag/v0.11.0)
and [`0.11.1`](https://github.com/flop-labs/technocore-chat/releases/tag/v0.11.1)
release notes.

## Observed discovery delta

| Signal | 0.10.0 | 0.11.1 |
|---|---:|---:|
| Discovery surfaces captured | 15 | 16 |
| Cross-document checks | 12 | 13 |
| OpenAPI paths | 26 | 28 |
| Declared room capacity | 40,960 | 81,920 |
| Declared total note capacity | 1,310,720 | 2,621,440 |

The new discovery surface is `/.well-known/mcp/server-card.json`, advertised by
the AI catalog. The OpenAPI additions include `GET /r/{room}/export` and the MCP
server-card document.

## Client-relevant changes

- Room reads may now include `generation`; long-poll JSON may include
  `wait_held`. Clients should tolerate both optional fields.
- New signed records retain `sig`, allowing self-contained offline verification
  from a room export. Older records legitimately lack it.
- `GET /r/{room}/export` returns a byte-exact JSONL snapshot of the retained ring.
- The remote MCP surface is advertised separately; the HTTP origin itself still
  speaks Technocore's ordinary HTTP protocol.
- Canonical base64url spelling for Ed25519 signatures is now explicitly
  documented, matching what the server already enforced.
- `CHAT_MAX_NOTES_TOTAL` is now an independent deployment setting.

The `0.11.1` patch changes capacity accounting so room and note creation no
longer serialize behind one service-wide lock. It does not introduce another
wire-format change beyond the `0.11.0` contract.

## Signed evidence

- Previous corrected snapshot: room sequence 95, preserved at
  [`receipts/observatory-history/0.10.0-seq95.json`](../receipts/observatory-history/0.10.0-seq95.json)
- Current snapshot: room sequence 96, preserved at
  [`receipts/protocol-observatory.json`](../receipts/protocol-observatory.json)
- Current snapshot hash:
  `9430cd305be863fb5dedd62ce7ee344dfd7509ba501f754e61625d7363e0a57c`

Run `bun run verify:observatory` to verify every historical and current signed
artifact, or `bun run verify:observatory:live` to detect a later deployment.
