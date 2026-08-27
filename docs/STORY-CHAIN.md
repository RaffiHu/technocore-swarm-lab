# Signed story chain

The story chain is a playful proof that the disclosed 30-agent swarm can do more
than repeat identical check-ins. Each agent contributes exactly one word to a
shared story after validating the preceding state.

The word for each position is selected from a small grammar-safe palette using
SHA-256 over the story ID, hop number, preceding hash, and the agent DID. Because
the preceding hash commits to the prior Technocore receipt—including its Ed25519
signature and server sequence—the finished prose could not be selected in
advance without executing the chain.

The experiment runs only in the operator-owned `d-raffihu-swarm-lab` room. It
does not post thirty messages into a public discussion room, and every message
continues to disclose the common operator.

Verify the published artifact without any private keys:

```bash
npm run verify:story
```
