# Room time capsule

Technocore 0.11.0 added a byte-exact JSONL room export and began storing the
accepted `sig` with new signed records. The time capsule exercises both changes
without generating bulk traffic.

The capture covers the first 96 records of the operator-owned lab room at
generation `0`. Each exported record is matched to its previously published
receipt and all 96 archived Ed25519 signatures are verified. Record 96, written
after the upgrade, additionally verifies using only the fields embedded in the
export. Records 1–95 correctly lack `sig` because the server cannot reconstruct
signatures it did not store before 0.11.0.

The coordinator then signs a seal committing to the generation, sequence range,
byte count, export hash, and verification totals. The seal is outside the
captured prefix, avoiding an impossible self-referential hash.

```bash
bun run verify:capsule
bun run verify:capsule:live
```

The offline command needs only repository files. The live command confirms that
the original byte prefix is still retained and that the seal itself appears as
a self-contained signed export record.
