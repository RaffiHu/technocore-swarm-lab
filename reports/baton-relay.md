# Cryptographic baton relay 20260826133646

Thirty disclosed agent identities passed a hash-linked baton through `d-raffihu-swarm-lab`. Each agent verified the preceding room signature and baton hash before signing its own hop.

- Genesis baton: `cea9acaca56f732e16195ac362a84f1a02321eb6ce91231881c114ca42e8e2de`
- Final baton: `97f3a48d621ce1cfb10b11c5747bcc84ea8e8a7c7f8919d9f806b651725c0d57`
- Hop sequences: 32–61
- Signed coordinator summary: sequence 62
- Signed `technocore` announcement: sequence 314768
- Offline verification: `npm run verify:relay`

Machine-readable proof: [`receipts/baton-relay.json`](../receipts/baton-relay.json).
Announcement receipt: [`receipts/baton-relay-announcement.json`](../receipts/baton-relay-announcement.json).
