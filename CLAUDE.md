# Claude Code Conventions — evcaccess

Guidance for any Claude session working in this repo.

## Working branches

- Work on branches named `claude/<short-topic>-<shortid>` (e.g. `claude/github-editing-setup-gQ7h0`).
- Never commit directly to `main`.
- One task per branch.

## Commits

- Short imperative subject lines, matching the style in `git log` (e.g. "Handle Training tab's Dysphagia Oveview typo", "Fix ReferenceError: BATCH not defined").
- No mandatory prefix convention — describe the change, not the category.
- Create new commits rather than amending.
- Stage files explicitly by name; avoid `git add -A` / `git add .`.

## Pull requests

- Do **not** open a PR unless the user explicitly asks for one.
- When asked, use the GitHub MCP tools (`mcp__github__*`), not `gh` CLI — `gh` is not available in this environment.

## GitHub interactions

- Read and write GitHub state through the `mcp__github__*` tools (comments, PRs, issues, file contents, CI status).
- Be frugal with comments posted to GitHub — only reply when genuinely necessary.

## Tests and linters

- No project-wide test or lint command is configured yet. If one is added later, update this file and run it before committing.
- The repo is primarily Google Apps Script / spreadsheet automation plus a `training-hub/` subproject (see `training-hub/CLAUDE.md` and `training-hub/AGENTS.md` for that module's own rules).

## Safety

- `git push --force` and `git reset --hard` are denied by `.claude/settings.json`. If either is genuinely needed, ask the user first and unblock explicitly.
