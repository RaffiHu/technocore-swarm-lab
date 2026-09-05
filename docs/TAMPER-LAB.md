# Tamper lab

Can a tiny gremlin rewrite the thirty-key relay? Try twelve reproducible rounds:

```bash
bun run tamper:lab
bun run tamper:lab --json
```

The lab reads only the public manifest and saved baton relay. It checks the
manifest commitment and baseline proof first, then makes a separate in-memory
copy for each edit. It needs no keys, dependencies, network, or live messages,
and never writes to the receipts. JSON output includes verifier errors and
expected outcomes; an unexpected result exits nonzero. CI runs the same lab.

| Round | Message signatures | Relay proof |
| --- | --- | --- |
| Untouched baton | Valid | Valid |
| Rewrite message text | Invalid | Invalid |
| Change a message's room | Invalid | Invalid |
| Change a nonce | Invalid | Invalid |
| Flip a signature bit | Invalid | Invalid |
| Change a hop timestamp | Valid | Invalid |
| Change a hop sequence | Valid | Invalid |
| Swap two hops | Valid | Invalid |
| Remove a hop | Valid | Invalid |
| Change a timestamp and rebuild all baton hashes | Valid | Invalid |
| Change an HTTP status label | Valid | Valid |
| Change the summary timestamp | Valid | Valid |

“Signatures” checks every remaining hop and the summary. Removing a message
does not damage the signatures on the messages left behind.

The interesting distinction is between **signed message content**, **linked
receipt metadata**, and **unprotected annotations**. The message signature
covers `room|nonce|text`. Hop timestamps and sequences enter the baton hash;
later signed messages commit to that history. Rebuilding the hashes after an
edit still disagrees with the coordinator's signed final baton.

Two rounds deliberately remain valid. `http_status` is an annotation outside
both commitments. The summary's timestamp is outside its signature and has
no subsequent baton to bind it. These fields should not be treated as
cryptographically authenticated just because the artifact verifier passes.
Even committed timestamps record what the participants observed; they are
not independent proof of server clock accuracy or server-signed receipts.

This is an educational regression exercise against the saved public proof,
not exhaustive adversarial validation of every possible artifact or a live
Technocore vulnerability report. See [the relay construction](BATON-RELAY.md).
