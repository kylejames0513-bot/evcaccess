# Training Hub

Next.js 16 + Supabase training compliance app (greenfield build, evolved from the reference clone in `../evcaccess-reference`).

## MCP (Cursor)

Vercel + Supabase are configured under [`.cursor/mcp.json`](.cursor/mcp.json). See [`.cursor/MCP_SETUP.md`](.cursor/MCP_SETUP.md) to sign in from **Settings → Tools & MCP**.

## Setup

1. Copy `.env.local.example` to `.env.local` and set Supabase URL/keys, `HR_PASSWORD` (local default in the example is `tennyson`), and `HUB_SYNC_TOKEN`.
2. Apply migrations: from repo root, use Supabase CLI `supabase db push` (or run SQL files in `supabase/migrations/` in order on your project).
3. `npm ci` then `npm run dev`.

## Scripts

| Command        | Description              |
|----------------|--------------------------|
| `npm run dev`  | Local dev server          |
| `npm run build`| Production build          |
| `npm run lint` | ESLint                    |
| `npm run typecheck` | TypeScript check     |
| `npm test`     | Vitest (resolver + tiers) |

## Excel sync

See [docs/sync-contract.md](docs/sync-contract.md). VBA modules live under `../evcaccess-reference/scripts/`.

## Push to GitHub

This repo’s remote is **`origin`** → `https://github.com/kylejames0513-bot/training-hub.git`. If `git push` says **Repository not found**, create an empty repository on GitHub with that exact name under your account (no README/license), then run:

```bash
git push -u origin main
```

If your repo URL or username differs, update the remote:

```bash
git remote set-url origin https://github.com/YOUR_USER/YOUR_REPO.git
```

Use **Git Credential Manager** (default on Windows) or a **Personal Access Token** with `repo` scope if GitHub prompts for sign-in.

## Reference catalog

See [docs/REFERENCE_CATALOG.md](docs/REFERENCE_CATALOG.md).
