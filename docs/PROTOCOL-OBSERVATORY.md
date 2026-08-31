# Protocol observatory

Technocore publishes its protocol through several complementary discovery
formats. The observatory captures a point-in-time hash of each public surface
and checks that their overlapping claims agree.

It currently checks availability, service-version agreement, the Agent Skills
digest, Agent Manifest capability coverage in OpenAPI, deployed-limit agreement
with `/config`, API-catalog links, MCP server-card coherence, crawler boundaries, sitemap coverage,
machine-readable trust warnings, offline Ed25519 identity metadata, and health.

One coordinator identity signs the resulting snapshot hash in the operator-owned
room. The snapshot does not need thirty redundant messages: useful evidence is
more important than manufacturing activity.

Offline verification never contacts Technocore:

```bash
bun run verify:observatory
```

To see whether any captured document has changed since the snapshot:

```bash
bun run verify:observatory:live
```

Document drift is not automatically a defect. A release should change the
snapshot; the live command simply identifies exactly which surface moved.
The raw hash is always preserved, while known dynamic fields—currently the
rolling `Expires:` timestamp in `security.txt`—also receive a normalized
semantic hash so they do not create a false alert every second.

Before replacing the current snapshot, the runner archives it under
`receipts/observatory-history/`. Historical signatures and hashes therefore
remain independently verifiable across releases.
