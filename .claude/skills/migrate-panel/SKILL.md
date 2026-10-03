---
name: migrate-panel
description: Move the LiteGapps web panel (web/) to a new VPS, set it up on a fresh one, or rebuild/redeploy it, so all panel data comes back the same. Use whenever the user installs a new VPS, migrates the panel, restores the panel database, rebuilds the panel image, or asks where the panel keeps its data. Triggers: "pindah vps", "vps baru", "migrasi", "deploy web", "build ulang panel", "restore db", "backup panel".
---

# Move or rebuild the LiteGapps panel

The panel (`web/`, see CLAUDE.md) keeps its data in MySQL and a few files
under `web/`. A **backup** (`/backup` page, `web/db-tool.mjs`) carries all of
it to another machine, so a move is: back up on the old VPS, deploy on the
new one, restore. Everything below was learned moving the panel on
2026-10-03.

## What a backup carries (and what it does not)

In the backup (encrypted, uploaded to `<FRS>/db/litegapps-db-*.lgdb`):

- tables `jobs`, `settings`, `build_targets`, `package_lists`, `build_config`
  (build identity, Config target, package lists, schedules, form selections);
- `web/job-logs/` (so restored jobs still open their logs), `web/api/` (File
  API indexes - their `md5` values cannot be rebuilt from SourceForge),
  `web/mirror-status.json`, `web/mirror-files.json`, `web/mirror-copied.tsv`;
- the values of the shell build configs the `/config` page edits (`config`,
  `packages/config`, `core/*/*/config`). A restore only rewrites values of
  keys the file still has, like `/config` does, and **skips the build
  identity keys in `config`** (`version`, `version.code`, `codename`,
  `name.builder`, `build.status`) - those live in `build_config`.

Never in a backup - carry these over by hand:

| What | Where | Notes |
|---|---|---|
| SourceForge ssh key | `~/.ssh/id_rsa` (`SSH_DIR`/`SSH_KEY_NAME`) | also the **backup key** (below) |
| login | `ADMIN_USER` / `ADMIN_PASSWORD` in `web/.env` | `users` is not backed up; `ensureAdmin()` creates it from `.env` |
| sessions | - | everyone logs in again |
| Drive mirror token | `~/.config/rclone/rclone.conf` | outside the checkout; never print it |
| `web/.env` settings | `SF_USER`, `SITE_URL`, `WEB_BIND`, `TZ` | MySQL passwords are generated fresh |
| reverse proxy | nginx site + cert | see "Domain" |
| downloaded sources | `bin/`, `core/*/gapps`, `packages/` | restore them again (Drive mirror is fastest) |

### The backup key is the ssh key

Backups are AES-256-GCM sealed with `sha256("litegapps-db-backup\n" +
id_rsa)`. Any machine holding the same ssh key - which it needs anyway to
reach the FRS - opens every backup; there is no separate key to lose. The
file header carries the key fingerprint, and the `/backup` page shows the
current one. Check a key on any machine:

```bash
( printf 'litegapps-db-backup\n'; cat ~/.ssh/id_rsa ) | sha256sum | cut -c1-64 | xxd -r -p | sha256sum | cut -c1-8
```

`DB_BACKUP_KEY` in `web/.env` is only for backups made before this (until
2026-10-03 `start.sh` generated a random key per VPS; the three backups of
2026-09-16 need key `caff8e73`, which was lost with the old VPS). Changing
the ssh key means older backups need the old key file again - keep it.

## Moving to a new VPS

On the **old** VPS, if it is still up: on `/backup`, press backup (it
uploads), and wait for any running job to end first.

On the **new** VPS:

1. Docker with the compose plugin, `git`, `curl`, `rsync`, `openssl`. No
   build tools are needed on the host - the panel image has them. The user
   may not be in the `docker` group; `start.sh` then uses `sudo docker`.
2. Clone the repo, put the SourceForge ssh key at `~/.ssh/id_rsa`
   (mode 600). Test it read-only:
   `rsync --list-only <SF_USER>@web.sourceforge.net:/home/frs/project/litegapps/`
   (`SF_USER` is `wahyu6070`; the FRS root is `/home/frs/project/litegapps`).
3. `bash web/start.sh` once - it creates `web/.env`, generates passwords and
   prints the admin login. Then set in `web/.env`: `SF_USER`, `ADMIN_PASSWORD`
   if wanted, `SITE_URL=https://litegapps.magisk.dev`, `WEB_BIND=127.0.0.1`
   when only the domain should reach it, and run `bash web/start.sh` again
   (env changes need a recreated container; `start.sh` or
   `docker compose -p litegapps-web up -d web` does that, `restart` does not).
4. `start.sh` fetches the backup list itself on a fresh install and says so
   when the database is empty. Open `/backup`, restore the newest backup.
   With the same ssh key it just works.
5. Optional: copy `rclone.conf` to `~/.config/rclone/`, then
   `sudo docker compose -p litegapps-web restart web` (the entrypoint copies
   it at start).
6. Restore the build sources from `/restore`, turn on the daily backup on
   `/backup`.

Never run the stack under another compose project name than
`litegapps-web` - it prefixes the MySQL volume and comes up empty.

## Domain (Cloudflare)

`litegapps.magisk.dev` is proxied by Cloudflare with SSL mode **Full**, so
Cloudflare connects to the origin on **443**; a missing 443 listener shows
as Cloudflare error **521** while plain http works. On the VPS, nginx
(`/etc/nginx/sites-available/litegapps`, symlinked into `sites-enabled`)
listens on 80 and 443 with a self-signed cert in `/etc/nginx/ssl/` and
proxies to `127.0.0.1:3020` with `Host $http_host` and
`X-Forwarded-Proto https` (the Server Actions origin check needs the real
host). Full (strict) would need a Cloudflare Origin CA cert instead. The VPS
may host other sites on the same nginx (e.g. `mirror.unpackgames.com`) -
add a server block, never replace theirs.

## Rebuilding / redeploying the panel

`bash web/start.sh` is idempotent: it pulls, rebuilds the image only when
files under `web/` changed (`web/.last_deploy_hash`), recreates the
container and waits for it. Delete `web/.last_deploy_hash` to force a
rebuild. It refuses while a job runs (recreating the container kills it);
`--force` overrides. Shell scripts and `web/db-tool.mjs` are read from the
mounted checkout, so changes to them need no rebuild; anything under
`web/src` does.

## Things that went wrong on the 2026-10-03 move

- The database came up empty and the old backups were useless: they were
  sealed with a random per-VPS key nobody had kept, and only held a test
  admin account. Fixed by the ssh-derived key and the fuller backup above.
- `SF_USER` was left at `YOUR_SF_USER`: every SourceForge job failed with
  `Permission denied (publickey)`.
- `/backup` listed nothing: the list is `web/db-backups.json`, written by the
  `db-list` job, never by a page refresh. `start.sh` now fetches it once.
- The domain gave 521 until nginx listened on 443 (see Domain).
- Someone edited `config` through `/config` with the maintainer identity
  (`name.builder`, `build.status`). That file stays neutral in git (see
  CLAUDE.md); never commit those values.
