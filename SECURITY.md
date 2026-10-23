# Security

Tacit reads the pages you visit and keeps a ledger of them, so security bugs matter more here than in most extensions.

## Reporting a vulnerability

Report it privately: open **Security → Report a vulnerability** on this repository. Please do not open a public issue. You will hear back within a few days.

## What counts

- Anything that lets a web page, a remote host or an unrelated program read or write the ledger, the harness API or the MCP server.
- Ways around the harness's token, its Host and Origin checks, its CORS policy, or the ledger UI's content security policy.
- Page content leaving the machine with no model key set or with decisions kept local, or more than the documented decision fields reaching a provider.
- A model key, or the harness's token, written anywhere but `~/.tacit`, or shown in a log, a service file or the dashboard.
- The extension reading a site on its skip list, or any site while paused.

## How Tacit is built to resist

- The harness listens on 127.0.0.1 only and rejects every `Host` other than `127.0.0.1:<port>` or `localhost:<port>`, which blocks DNS rebinding.
- Every API call but the health check needs the harness's token, 32 random bytes in `~/.tacit/token` (0600), as `Authorization: Bearer`. The health check carries no data.
- A client never sends the token to whatever answers on the port: it first sends a random challenge, and sends the token only if the answer is the HMAC-SHA256 of that challenge under the token. A program that took the port while the harness was down learns nothing.
- `bun run pair` hands the token to the browser in the fragment of a local page's address, which browsers never send to a server; the page removes it from the address bar at once. The extension keeps it in its storage, the dashboard in its own origin's.
- Requests carrying an `Origin` other than a browser extension or the harness itself are refused with 403. CORS is reflected only for `chrome-extension://` origins, never `*`.
- Request bodies are capped at 2 MB and validated against the protocol before anything is stored.
- The ledger lives in `~/.tacit` (or `$TACIT_HOME`) as SQLite: 0600 files in a 0700 folder.
- The ledger UI uses a per-request nonce CSP, renders page-derived text as text, and links only `http(s)` URLs.
- The MCP server is read-only and speaks over stdio. It never opens a port.
- Model keys live in `~/.tacit/keys.json` (0600) or the environment. `bun run keys` reads them without echo and shows only a hint (`sk-or-…439f`). The background service's launchd or systemd file never holds a key, nor a proxy address with a password in it.
- A `models.json` that cannot be used leaves only the code engine, on this machine: a typo cannot send decisions somewhere the user said they should not go. `TACIT_PRIVACY=local` can keep decisions local and never send them out.

## Known limitations

- Any program running as your user can read `~/.tacit`, the token and the keys included, as with every local app.
- Between a client's challenge and its next request there is a moment in which another program could take the port, if the harness stopped in exactly that moment. The window is milliseconds and needs the harness to stop; binding the token to each connection would close it.
- Any Chrome extension passes the Origin check; without the token it gets nothing but the health check.

## Supported versions

Tacit is pre-1.0: fixes land on the latest release only.
