# Training Hub

Next.js 16 + Supabase training compliance app (greenfield build, evolved from the reference clone in `../evcaccess-reference`).

## MCP (Cursor)

Vercel + Supabase are configured under [`.cursor/mcp.json`](.cursor/mcp.json). See [`.cursor/MCP_SETUP.md`](.cursor/MCP_SETUP.md) to sign in from **Settings → Tools & MCP**.

## Setup

1. Copy `.env.local.example` to `.env.local` and set Supabase URL/keys, `HR_PASSWORD` (local default in the example is `tennyson`), and `HUB_SYNC_TOKEN`.
2. Apply migrations: from repo root, use Supabase CLI `supabase db push` (or run SQL files in `supabase/migrations/` in order on your project).
3. `npm ci` then `npm run dev`.

## Cursor Cloud environment bootstrap

The repo includes a root-level cloud-agent environment config:

- `.cursor/environment.json`
- `.cursor/environment-bootstrap.sh`

On cloud-agent startup, the install step runs `npm ci` inside `training-hub` so dependencies are preinstalled before tasks execute.

To verify a machine is ready, run:

```bash
bash .cursor/environment-verify.sh
```

## Scripts

| Command        | Description              |
|----------------|--------------------------|
| `npm run dev`  | Local dev server          |
| `npm run build`| Production build          |
| `npm run lint` | ESLint                    |
| `npm run typecheck` | TypeScript check     |
| `npm test`     | Vitest (resolver + tiers) |

## Excel sync

See [docs/sync-contract.md](docs/sync-contract.md) and [docs/vba-sync-setup.md](docs/vba-sync-setup.md). Import-ready VBA modules are tracked in `../scripts/`.

## Push to GitHub

The canonical repo is **`kylejames0513-bot/evcaccess`** — this app lives in the **`training-hub/`** folder there: [github.com/kylejames0513-bot/evcaccess](https://github.com/kylejames0513-bot/evcaccess).

This folder (`Documents/training-hub`) is a **standalone** git clone for fast local work. To publish updates to GitHub, sync into a clone of `evcaccess` and push from that repo root, for example:

```powershell
robocopy "C:\Users\mahon\OneDrive\Documents\training-hub" "C:\Users\mahon\OneDrive\Documents\evcaccess\training-hub" /MIR /XD .git node_modules .next .vercel
cd C:\Users\mahon\OneDrive\Documents\evcaccess
git add training-hub
git commit -m "training-hub: describe your change"
git push origin main
```

Use **Git Credential Manager** or a **Personal Access Token** (`repo` scope) if GitHub prompts for sign-in.

## Reference catalog

See [docs/REFERENCE_CATALOG.md](docs/REFERENCE_CATALOG.md).
