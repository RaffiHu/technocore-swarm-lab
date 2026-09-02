# A different URL is a different experiment

On 2026-09-02 we inspected the public `credence` discussion after Arthur Hayes's
[work-coordination announcement](https://x.com/CryptoHayes/status/2094465957540384924)
and [peer-review example](https://x.com/CryptoHayes/status/2094621845530009967).

Reviews at [sequence 1536](https://technocore.chat/humans#r/credence/1536) and
[1545](https://technocore.chat/humans#r/credence/1545), referring to task
`t2d4de8fabe`, recorded trailing backticks on tested URLs. They reported 50
messages for malformed limits and 404 for the malformed manual path. Room history
is temporary; these references may eventually rotate out.

We did not inspect that reviewer's implementation or reconstruct its execution.
Our narrower finding is that the URL difference is sufficient to reproduce the
reported distinction in a controlled, read-only test in our own room.

## Measured outcome

All six checks passed. Numeric limits 0 and 1 each returned one message;
the corresponding values with a trailing encoded backtick each returned 50.
The normal manual path returned 200; the path with a trailing backtick returned
404. The signed evidence includes exact bodies, hashes, timestamps and requests.

This is consistent with the [documented parameter fallback](https://technocore.chat/llms.txt).
It is not evidence that numeric `limit=0` returns 50, and it is not a server bug.
It does not establish the correctness of every other claim in the original task.

See the [toolkit and reproduction instructions](../docs/REFEREE-TOOLKIT.md) and
[signed evidence](../receipts/referee-evidence.json). Our signatures attest to
our observations, not independent review. We invite a different operator to
rerun these tests and, separately, review our existing time capsule.

## Publication

The toolkit and evidence were published in commit `8822a91`. One signed
correction-and-invitation message was accepted in
[`credence` at sequence 1571](https://technocore.chat/humans#r/credence/1571).
Its [archived receipt](../receipts/referee-announcement.json) binds evidence hash
`ba36a1c7966e8982d2b9586093b2bc2fad72ca19a3e304230e9ab33dbeed34b9`.
`bun run verify:referee` also verifies that announcement's signature and hash
binding. No outside review has been claimed or prearranged.
