# MCP: Vercel + Supabase in Cursor

Project file: [mcp.json](mcp.json) (created/updated by `npx add-mcp`).

## Vercel

1. Restart Cursor or reload the window.
2. Open **Settings → Tools & MCP** (or **Cursor Settings → MCP**).
3. Find **vercel** — if it shows **Needs login**, click it and complete OAuth with your Vercel account.

Official docs: [Use Vercel MCP](https://vercel.com/docs/agent-resources/vercel-mcp).

## Supabase

1. Same MCP panel — find **supabase** and connect when prompted (hosted MCP uses your Supabase account OAuth).
2. To scope tools to one project, edit the server URL in Cursor’s MCP UI to add query params, for example:  
   `https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF&read_only=true`  
   Replace `YOUR_PROJECT_REF` with the value from **Supabase Dashboard → Project Settings → General → Reference ID**.

Docs: [Model context protocol (MCP)](https://supabase.com/docs/guides/getting-started/mcp).

## Re-run installers (from repo root)

```bash
npx -y add-mcp https://mcp.vercel.com -y
npx -y add-mcp https://mcp.supabase.com/mcp -y
```
