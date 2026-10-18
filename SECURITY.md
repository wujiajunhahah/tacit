# Security

Tacit reads the pages you visit and keeps a ledger of them, so security bugs matter more here than in most extensions.

## Reporting a vulnerability

Report it privately: open **Security → Report a vulnerability** on this repository. Please do not open a public issue. You will hear back within a few days.

## What counts

- Anything that lets a web page, a remote host or an unrelated program read or write the ledger, the harness API or the MCP server.
- Ways around the harness's Host and Origin checks, its CORS policy, or the ledger UI's content security policy.
- Page content leaving the machine while Jev is off, or more than the documented decision fields reaching Jev while it is on.
- The extension reading a site on its skip list, or any site while paused.

## How Tacit is built to resist

- The harness listens on 127.0.0.1 only and rejects every `Host` other than `127.0.0.1:<port>` or `localhost:<port>`, which blocks DNS rebinding.
- Requests carrying an `Origin` other than a browser extension or the harness itself are refused with 403. CORS is reflected only for `chrome-extension://` origins, never `*`.
- Request bodies are capped at 2 MB and validated against the protocol before anything is stored.
- The ledger lives in `~/.tacit` (or `$TACIT_HOME`) as SQLite: 0600 files in a 0700 folder.
- The ledger UI uses a per-request nonce CSP, renders page-derived text as text, and links only `http(s)` URLs.
- The MCP server is read-only and speaks over stdio. It never opens a port.

## Known limitations

- Any Chrome extension passes the harness's Origin check, not only Tacit. Pinning the harness to Tacit's extension ID is planned.
- Any program running as your user can read `~/.tacit`, as with every local app.

## Supported versions

Tacit is pre-1.0: fixes land on the latest release only.
