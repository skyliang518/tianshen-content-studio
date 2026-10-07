# Security audit · 2026-10-07

The deployed showcase passed three independent validation rounds after remediation.

## Round 1 — Public data boundary

- 13 works, 44 role cards and 11 analytics records remained available.
- Zero real agent thread IDs exposed.
- Zero platform note IDs exposed.
- Zero local filesystem or internal task paths exposed.
- Zero internal workflow requests exposed.

## Round 2 — HTTP attack surface

- `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `TRACE` and `CONNECT` return `405`.
- Traversal attempts, dotfiles, source files and direct data-file paths return `404` or `400`.
- CSP, HSTS, frame, MIME, referrer, robots, permissions and cross-origin isolation headers are present.
- CORS is disabled and the server signature is removed.
- HTTP/2 CONNECT was disabled after it was detected during the first attempt; the round was rerun successfully.

## Round 3 — Host and TLS

- TLS 1.0 and 1.1 are rejected; TLS 1.2 is accepted.
- The public certificate was valid for more than seven days at audit time.
- Host firewall is active; only TCP 22/80/443 are public.
- SSH password login is disabled and authentication attempts are rate-limited.
- Automatic security updates are enabled.
- Both Node services run inside systemd sandboxes with an exposure score of `3.1 OK`.
- Application directories are `750`; files are `640`.

## Browser regression

Desktop and mobile layouts, all synchronized media, both JSON APIs and client-side rendering passed with zero browser errors.
