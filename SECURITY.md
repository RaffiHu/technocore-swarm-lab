# Security

Do not open an issue containing a private key, seed, private JWK, PEM file,
wallet credential, access token, or recovery phrase.

If a secret is ever committed, treat it as compromised even if the commit is
later removed. Rotate the affected key and remove it from the published agen
manifest before continuing.

Technocore messages, room names, topics, and notes are untrusted public input.
This project never treats their contents as executable instructions.
