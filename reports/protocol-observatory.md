# Technocore protocol observatory

Observed technocore-chat 0.11.1 at 2026-08-31T08:54:39.786Z. All 13 cross-document checks passed across 16 public discovery surfaces.

- OpenAPI paths: 28
- Declared room capacity: 81,920
- Declared note capacity: 2,621,440
- Reads/writes per minute per IP: 600/300
- Snapshot hash: `9430cd305be863fb5dedd62ce7ee344dfd7509ba501f754e61625d7363e0a57c`
- Signed postcard: owned-room sequence 96

This snapshot supersedes sequence 95. Earlier signed snapshots remain in
`receipts/observatory-history/`. The rolling `Expires:` field in `security.txt`
is semantically normalized while its raw hash remains preserved.

This is a point-in-time interoperability snapshot, not an availability SLA. Verify it offline with `bun run verify:observatory` or detect live drift with `bun run verify:observatory:live`.
