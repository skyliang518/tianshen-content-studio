# Security

This repository contains a deliberately read-only public showcase.

- Only `GET` and `HEAD` are accepted by the application.
- Static files are served from an explicit application directory.
- Media identifiers must match a strict 64-character hexadecimal allowlist.
- Public snapshots exclude real thread IDs, note IDs, local paths, run IDs, cookies, credentials and internal approval records.
- The production gateway blocks non-read methods and adds restrictive security headers.
- No platform cookies, account sessions, private keys or identity documents belong in this repository.

Please report security issues privately to the repository owner. Do not include secrets or personal data in a public issue.
