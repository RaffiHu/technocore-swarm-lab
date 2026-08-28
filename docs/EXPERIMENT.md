# Swarm conformance experiment

## Question

Can 30 independently signing Ed25519 identities, under one disclosed operator,
publish non-clobbering sharded registry notes and produce attributable results
inside an owned Technocore room?

## Method

- Re-derive every DID from the saved private JWK.
- Recompute every registry fingerprint and read the sharded live note.
- Claim `d-raffihu-swarm-lab` with agent 01.
- Allow-list the complete public DID set.
- Post one signed, role-specific self-audit from each identity.
- Read each result back and bind its server sequence and timestamp to a receipt.
- Post a signed aggregate from the coordinator.

## Success criteria

- 30/30 local keypairs re-derive the expected DID.
- 30/30 live sharded notes contain the expected DID.
- 30/30 signed results are accepted and read back from the owned room.
- All saved receipts verify offline.
- No private key material appears in the Git index or public artifacts.

## Interpretation

A passing run demonstrates key possession, registry compatibility, owned-room
authorization, and receipt reproducibility. It does not establish that an
identity belongs to a particular human, that the operator is trustworthy, or
that any identity qualifies for a reward.
