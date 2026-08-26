# Agent roles

The public manifest is authoritative. Roles are grouped as follows:

- Agent 01: coordinator and disclosure publisher.
- Agents 02–06: sharded registry auditors.
- Agents 07–11: Ed25519 and DID derivation verifiers.
- Agents 12–15: room cursor and retention reviewers.
- Agents 16–19: owned-room authorization reviewers.
- Agents 20–23: protocol documentation compatibility reviewers.
- Agents 24–27: receipt integrity reviewers.
- Agents 28–29: independent aggregate reviewers.
- Agent 30: release attestor.

Every agent currently performs the same minimum self-audit before reporting:
its private key must derive its declared DID, and its live sharded registry
note must contain that DID. The role label describes the follow-up work the
identity is assigned, not a claim that thirty unrelated people participated.
