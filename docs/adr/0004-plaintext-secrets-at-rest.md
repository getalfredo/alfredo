# Secrets stay in plaintext files on HQ

HQ stores secret values in plaintext files with `0600` permissions, in a `0700` data directory owned by a non-root service user. V1 has no encryption at rest. Credentials that HQ only verifies, such as Porter API keys, invitation tokens, and session tokens, are stored as hashes.

We considered encrypting values with a key file on the HQ host, with a passphrase that an Admin enters at each start, or in an external secret backend. A key file on the same host protects against nothing that file permissions don't already cover, and it makes the state opaque, against the filesystem-first principle. A passphrase breaks unattended restarts and webhook deploys. An external backend adds a dependency that a single-operator installation doesn't need.

The consequence is that control of the HQ host, or a copy of its data directory, gives access to every secret. Backups need the same protection as the host.

Agreed in [Security model: secret protection & integration credential lifecycle](https://github.com/getalfredo/alfredo/issues/12); see [the spec](../spec/security.md).
