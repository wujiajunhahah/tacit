# Contributing to Tacit

Thanks for helping. Tacit is young, so small, focused changes land fastest.

## Set up

```bash
git clone https://github.com/wujiajunhahah/tacit.git
cd tacit
bun install
bun run build
bunx playwright install chromium   # only needed for bun run e2e
```

## Before you open a pull request

```bash
bun run typecheck
bun run test
bun run e2e   # if you touched the extension, the harness or the demo site
```

CI runs the same commands on every push and pull request.

## Where things live

| Folder | What |
|---|---|
| `core/` | Shared logic with no browser or server APIs: intent, ranking, decisions, the packet, the protocol |
| `extension/` | MV3 extension: `extract` (senses), `track.ts`, `surface` (the line), the service worker |
| `daemon/` | The harness: `db.ts` (SQLite), `queries.ts`, `server.ts` (HTTP), `ui/`, `mcp.ts` |
| `demo/` | The offline demo site used by the e2e run and the recording |
| `scripts/` | Build, e2e, recording, smoke test |
| `test/` | Bun tests, mirroring the folders above |

The wire contract between the extension, the harness and agents is `core/protocol.ts`. If you change a type in `core/`, update `daemon/schemas.ts` as well: its compile-time checks fail until every field and enum member is covered.

## Style

- TypeScript strict, small focused modules.
- Comments in English, at most one short line, and only where the why is not obvious.
- No new runtime dependencies without a strong reason. The extension ships no third-party code.
- UI: ink on paper, one lime accent, system fonts, no emoji.

## Principles to keep

Semantics stay stable (suggested, confirmed, executed, undone). Act only when sure. Fold, never hide. Say where every prediction came from. Local by default. A change that bends one of these needs a very good reason in its pull request.

## Reporting bugs

Open an issue with steps to reproduce. Never paste private page content or your ledger: the demo site (`bun run demo`) reproduces most behaviour. For security issues, see [SECURITY.md](SECURITY.md).
