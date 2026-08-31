# Signed room time capsule

Captured generation 0 of `d-raffihu-swarm-lab` as byte-exact JSONL before sealing it at sequence 97.

- Export sequences: 1–96
- Records: 96
- Bytes: 39,837
- SHA-256: `abf21a798b9516b472a22da5a8ad7bd0f85b06a37f08c2b2aa9a6bf4e5de713b`
- Records matched to public receipts: 96/96
- Archived signatures verified: 96/96
- Self-contained embedded signatures verified: 1/1
- Legacy records without embedded `sig`: 95

Records 1–95 predate Technocore 0.11.0 and legitimately omit `sig`; their signatures remain in this repository's earlier public receipts. Record 96 demonstrates the new self-contained format.

Verify offline with `bun run verify:capsule`, or confirm the preserved prefix and seal against the live room with `bun run verify:capsule:live`.
