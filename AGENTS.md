# AGENTS.md

Notes for any coding agent working in this repository. The full working guide
is **[CLAUDE.md](CLAUDE.md)** — read that first; this file is the short list of
rules that are easy to get wrong.

## What this repo is

The LiteGapps build tool: POSIX shell (`build.sh`, `lib/`, `packages/`) that
packages Google Apps into flashable zips, plus `web/` — a Next.js + MySQL +
Docker admin panel that drives those same scripts from a browser. The panel
never reimplements build logic.

## Hard rules

- **Everything inside files is English** — `#` comments, `print`/`ui_print`
  strings, log messages, commit messages. Replies to the user can be
  Indonesian; the code stays English. (User-facing panel strings are
  Indonesian, since that is the panel's UI language.)
- **Never commit secrets**: `web/.env`, ssh keys, passwords, database dumps.
  `git check-ignore -v <path>` before assuming a new file is tracked — the
  artifact names in `.gitignore` (`log`, `bin`, `files`, `output`, `tmp`) match
  at *any* depth, which is why `!web/src/**` exists.
- **Commit and push only when the user asks.**
- **Do not run `upload` / `update-gapps-server`** unless explicitly asked; they
  publish to the release server.
- **Never sync `web/` to the SourceForge FRS** — it is world-readable and that
  directory holds the panel's compose file and `.env.example`.
- Anything uploaded to `$HOMEE` (`/home/frs/project/litegapps`) is public.
  Database backups that go to `<project>/db/` are therefore always encrypted.

## Before deploying the panel

`bash web/start.sh` recreates the web container, which **kills a running
build** — the job dies half way and is recorded as failed. The script now
refuses to deploy while a job is running (database row or `web/.job.lock`);
wait for it, or pass `--force` when you really mean it.

## Testing

There is no test suite. Verify against the live panel on the VPS: `npx tsc
--noEmit -p web`, deploy, then drive the UI with the Playwright image
(`mcr.microsoft.com/playwright:v1.48.0-jammy`, `--network host`). Test files
must live under a home directory — snap Docker cannot see `/tmp`. Clean up
test files and any test rows/jobs afterwards.
