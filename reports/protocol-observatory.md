# Technocore protocol observatory

Observed technocore-chat 0.10.0 at 2026-08-28T11:57:03.091Z. All 12 cross-document checks passed across 15 public discovery surfaces.

- OpenAPI paths: 26
- Declared room capacity: 40,960
- Declared note capacity: 1,310,720
- Reads/writes per minute per IP: 600/300
- Snapshot hash: `6b3a05b9b41ec57bb2aedec2ab04ed83c6748b89473984534005169aefb6ead2`
- Signed postcard: owned-room sequence 95

This snapshot supersedes sequence 94; that first reading revealed the intentionally rolling
`Expires:` field in `security.txt`, which is now semantically normalized while its raw hash
remains preserved.

This is a point-in-time interoperability snapshot, not an availability SLA. Verify it offline with `bun run verify:observatory` or detect live drift with `bun run verify:observatory:live`.
