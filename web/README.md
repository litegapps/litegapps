# web/ — LiteGapps build panel

A Next.js app that runs the build work from a browser instead of the VPS
terminal: pick a target, start the job, watch the log, and see what already
exists on the SourceForge release server.

**The whole site is the admin panel.** `/` requires a login and the app sends
`noindex` on every route. The deliberate exceptions are `/api/addon/*` (the
addon index the LiteGapps Controller app downloads) and `/api/litegapps/*`
(newest release per variant) - File API, see below; never put a login on
them. The panel is opened at
`http://<VPS IP>:<WEB_PORT>` (default 3020) and also at
`https://litegapps.magisk.dev` through Cloudflare.

## How it works

The panel never reimplements build or upload logic. It shells out to the
scripts that already own it:

| panel command | what runs |
|---|---|
| Build varian | `bash build.sh make litegapps <variant> <arch> <sdk>` |
| Build banyak target (checklist) | `bash web/build-batch.sh <archs> <sdks> <variants\|auto> <restore> <clean>` |
| Build packages | `bash packages/make make <arch> <sdk>` |
| Restore | `sh build.sh restore` |
| Restore → bin | `sh build.sh restore bin` |
| Restore → Package | `bash packages/make restore <arch> <sdk>` |
| Restore → LiteGapps | `sh build.sh restore litegapps <variant,...> <arch> <sdk>` |
| Restore → Hapus source | `bash web/clean-sources.sh <arch> <sdk>` |
| Clean | `sh build.sh clean` |
| Segarkan status | `bash web/make-status.sh` |
| File API → Addon → Perbarui | `bash web/make-addon-api.sh [<arch> <sdk>]` |
| File API → Rilis → Perbarui | `bash web/make-release-api.sh [<arch> <sdk>]` |

Three things keep two builds from ever running at once, since they share
`output/`, `log/` and the gapps tree:

1. the database: a job is refused while another one is marked running, and the
   buttons poll `/api/jobs/running` so a build started in another tab disables
   them here without a reload;
2. a process scan (`src/lib/procs.ts`): before a build-ish job starts, the
   panel looks for `build.sh` / `packages/make` / `build-batch.sh` already
   running in this container - a build started with `docker exec`, or one
   whose row was lost, is caught here and named in the error. (It cannot see
   builds run on the host outside the container, which is a reason to start
   them from the panel.)
3. `flock -n` on `web/.job.lock`, held by the job process itself for exactly
   as long as it runs. The server closes its own copy of that descriptor right
   after spawning: a flock lives on the open file description, so leaving it
   open in the panel would keep the lock after the job ended and refuse every
   later build.

Jobs that do not touch the build tree (status refresh, database backup) skip
the lock, so a long build never blocks them.

Commands are assembled from a fixed allowlist (`src/lib/targets.ts`) and
handed to `spawn()` as an argv array with no shell, so nothing submitted
through a form is ever interpreted. Jobs are detached, so a multi-hour build
outlives the request that started it; output goes to `web/job-logs/<id>.log`
and the browser tails it over `/api/jobs/<id>/log`. Only one job runs at a
time, because they all share `output/` and `log/`.

The availability matrix is read from `status.json` on disk, written by
`make-status.sh`. The web process deliberately never talks to SourceForge
during a request: that would put the release ssh key in the request path and
a 600-file rsync in a page load.

MySQL holds only the admin account, live sessions, and job history. Nothing
about releases is stored there.

## Files

| path | what it is |
|---|---|
| `src/app/` | routes — `/` (Build), `/restore` (Package / LiteGapps tabs), `/config` (build configs), `/files` (file manager), `/backup` (database backup), `/info` (release matrices), `/server` (VPS stats), `/login`, `/api/jobs/[id]/log`, `/api/server` |
| `src/lib/` | `db`, `session`, `jobs`, `status`, `targets`, `paths`, `sysinfo`, `restore`, `config`, `files`, `backup`, `settings`, `scheduler`, `buildtargets`, `packages` |
| `src/components/` | UI — matrix, build forms, job list, terminal dialog, theme toggle |
| `db-backup.sh` / `db-restore.sh` / `db-list.sh` / `db-tool.mjs` | encrypted database backup to `<SF>/db/`, restore, and remote listing |
| `sf-common.sh` | shared SourceForge settings and ssh options for the shell jobs |
| `sf-prune.sh` | keeps the newest 15 dated releases per variant on the FRS, deletes older ones |
| `gdrive-mirror.sh` | `check`/`sync`/`file <path>` the SourceForge sources to Google Drive via rclone (page: `/mirror`; writes `mirror-status.json`, `mirror-files.json`, `mirror-copied.tsv`) |
| `clear-output.sh` | deletes `output/`, `packages/output/` and `log/` (sources kept); run by the "Bersihkan data & log" button |
| `build-batch.sh` | builds every ticked arch x SDK in one job (variants per target resolved by the panel), restoring sources first when asked; its log feeds the progress table (`src/lib/batchlog.ts`, `/api/jobs/<id>/batch`) |
| `clean-sources.sh` | deletes one target's restored sources (mirrors `cleanup_target` in `vps-build.sh`; keeps `output/`) |
| `make-status.sh` | regenerates `status.json` from the SourceForge listing |
| `make-addon-api.sh` / `addon-api.mjs` | regenerate the public addon index `api/addon/<arch>/<sdk>.json` + `index.json` (gitignored) from `<FRS>/addon/`, and upload the same list as `README.md` to the `addon/` folders on SourceForge; served **without login** at `/api/addon/...` for the LiteGapps Controller app, managed on `/file-api` |
| `make-release-api.sh` / `release-api.mjs` | regenerate the public release index `api/litegapps/<arch>/<sdk>.json` + `index.json` (newest release per variant: link, md5, upload time) from `<FRS>/litegapps/`; served **without login** at `/api/litegapps/...` |
| `api-common.mjs` | helpers shared by both generators (listing parser, md5 from local file or RSS, atomic writes) |
| `status.json` | **generated — do not hand-edit**, re-run the script |

## Deploying while a job runs

`bash web/start.sh` recreates the web container, which kills whatever build,
restore or upload it is running - the job dies half way and comes back as
`failed`/`unknown`. So the script refuses to deploy when the database has a
running job, or when something holds `web/.job.lock`, and says which one.
`bash web/start.sh --force` deploys anyway (and kills it).

## Running it

One command, safe to run again at any time:

```bash
bash web/start.sh
```

It pulls the code (`--ff-only`), creates `.env` and fills in anything still
empty (database passwords generated; your own values are kept), moves to a
free port if `WEB_PORT` is taken by another project, rebuilds the image only
when files under `web/` changed, starts MySQL and the panel, re-applies the
MySQL password from `.env`, and waits until the panel answers before printing
its address. A second run with no changes takes a few seconds.

Two things it guards against, both learned the hard way on unpackgamesnew:

- **The compose project name is fixed** (`litegapps-web`, also `name:` in
  `docker-compose.yml`). It prefixes the MySQL volume; a different name means
  a fresh, empty database. The stack used to run under the directory name
  `web` — the first run of `start.sh` copies that volume across once and
  leaves the old one in place for you to remove.
- **MySQL reads `MYSQL_PASSWORD` only when the volume is first created.**
  Changing it in `.env` later would lock the panel out of its own database,
  so every deploy re-applies it.

Follow the logs with `sudo docker compose -p litegapps-web logs -f web`.

The panel listens on `$WEB_BIND:$WEB_PORT` (default `0.0.0.0:3020`); the port
is configurable because other projects on the VPS already hold 3000 and 3010.
The container mounts the repo at `/litegapps` and your ssh directory
read-only at `/ssh-host`.

At start-up `docker-entrypoint.sh` does two things before launching the
server:

- **Imports only the SourceForge key.** The file named `SSH_KEY_NAME` and
  `known_hosts` are copied into the builder's home with owner-only modes. The
  host directory cannot be used in place — ssh refuses keys owned by another
  user — and the host's ssh `config` is deliberately left out, since it may
  map `web.sourceforge.net` to a different account. Nothing is baked into the
  image.
- **Drops to the host user** (`PUID`/`PGID`). Builds run inside the bind-
  mounted checkout; as root they would leave `output/`, `log/`, `bin/` owned
  by root, and `sh build.sh clean` or `vps-build.sh` from the host account
  could no longer delete them.

The admin account is created on first run from `ADMIN_USER` /
`ADMIN_PASSWORD`; changing the password in `.env` and restarting updates it.

Refreshing the matrix by hand, outside the panel:

```bash
bash web/make-status.sh
```

The oldest target is Android 7.0 (SDK 24, `MIN_SDK` in `src/lib/targets.ts`):
SDK 21-23 are not listed and are refused server-side.
When a new SDK is added, extend `SDK_MAP` in `make-status.sh` and `SDKS` in
`src/lib/targets.ts`, alongside `get_android_version()` in `build.sh`.

## Build page

`/` has a toolbar with three tabs: **Build banyak**, **Satu perintah** and
**Config target**.

**Config target** holds the panel's own build config, in its database - not
`config`, not the per-variant configs under `core/`:

- **Varian per target** (`build_targets`): which variants each arch x Android
  version is built with. A target that is left on the default is not stored,
  so it keeps following `defaultVariants()` in `src/lib/targets.ts` (arm64
  SDK <= 28 core+lite, arm64 SDK 29+ pixel+lite+superlite, arm/x86/x86_64
  core, plus superlite from SDK 29 - the split the release build uses). An
  empty list means the target is not built at all.
- **Daftar paket per varian** (`package_lists`): which apps from the addon
  build are copied into micro/nano/basic/user/go, plus the list of apps that
  already ship inside the base gapps and are therefore skipped for `core`.
  Defaults live in `lib/litegapps.sh`; a stored list is handed to the build
  as `LG_PKGS_<VARIANT>` / `LG_CORE_KEEP`, which those shell functions read
  in place of their built-in lists (names are filtered to
  `[A-Za-z0-9._-]` on both sides).

- **Identitas & versi build ini** (`build_config`): `version`,
  `version.code`, `codename`, `name.builder`, `build.status` for builds made
  on this machine. The repo `config` stays neutral (`yourname`,
  `unofficial`) for everyone who clones it; these values reach every job that
  reads the config as `LG_CFG_<key>`, which `get_config()` in `build.sh` and
  `web/make-status.sh` read before the file. An empty field falls back to the
  file.

All three travel with the database backup, so the configuration survives a
redeploy and can be restored on another machine.

Nothing about *which* targets are built is read from the repo: the panel
resolves the variant list per target before the job starts and passes it in
argv as `<arch>:<sdk>=<variant,...>`, then the batch script invokes
`bash build.sh make litegapps <variant> <arch> <sdk>` per variant - the same
call the maintainer release build makes. The main `config` still supplies
version, compression, zip level, signer and builder.

**Build banyak** is the checklist: tick architectures and Android versions and
every combination is queued into a single batch job, because builds share
`output/` and `log/` and cannot run in parallel. Its options:

- restore a missing gapps source before building it,
- build the addon packages for each target first
  (`bash packages/make make <arch> <sdk>`, restoring the package source when
  allowed),
- release the results to SourceForge - addon to `<FRS>/addon/<arch>/<sdk>/`
  and zips to `<FRS>/litegapps/<arch>/<sdk>/` (`rsync -R`, which creates the
  remote directories; off by default, since it publishes). After a successful
  zip upload `web/sf-prune.sh` keeps only the newest 15 dated releases per
  variant folder and deletes the rest (`SF_KEEP_RELEASES`, `--dry-run`); the
  on/off switch and the count are in Build > Settings,
- delete the target's sources afterwards so a long run does not fill the disk.

A failing target is logged and the run continues; the job ends non-zero if
anything failed, and the log lists which targets did. The preview table under
the checklist says, per target, whether the source is already on the VPS,
still has to be downloaded, or is not on the server at all.

Both forms remember what they were set to: every change is written (debounced)
to the `settings` table through `POST /api/prefs`, and a run stores the same
thing again, so leaving for another menu - or coming back tomorrow - continues
from the last selection instead of the defaults. That includes the option
checkboxes, the SourceForge release one among them, so check what is ticked
before starting a build. The values are re-validated on the way out, and a
preference that cannot be stored never stops a build.

**Satu perintah** is the other tab: one command at a time (a single variant
build, a config-driven restore, clean, status refresh). It keeps its own tab
after starting a job, so the terminal opens where the command was launched.

## Terminal panel

Every action the panel offers ends in a shell script, so the panel shows that
script's own output rather than a spinner. The terminal is a card on the page
itself - under the build forms on `/`, under the restore actions on
`/restore`, under the backup actions on `/backup` and under the status
refresh on `/info` - not a dialog over them.

Starting a job redirects to `?job=<id>` and that panel tails it; the job
history's "log" button points the same panel at any job, finished ones
included. With no `?job=`, the panel falls back to whatever
`/api/jobs/running` reports, so a build started in another tab reports here
too.

Each panel is scoped to the job kinds that belong to its page (`kinds` prop),
so a batch build's log stays under the checklist and never appears under the
single-command form: a panel that does not own the running job shows a line
pointing at the page that does.

It polls `/api/jobs/<id>/log` every 1.5s and reads its header from the same
response (label, kind, status, exit code, elapsed). Progress comes from the
markers the scripts already print - `=== [2/7] core arm64 sdk 36 ===` - so the
runner needs no extra state: the counter, the bar and the step line all come
out of the log. The last `- `/`! ` line is appended to the step, which is what
tells you which download or which variant a long target is stuck on.

## Info page

`/info` is the read-only view of the release server: version, last release
date, how many gapps and package sources exist, the arch x Android matrices
for gapps source, package source and published releases, and the button that
refreshes `status.json`.

## Backup page

`/backup` dumps the panel database and uploads it to the SourceForge release
area at `<project>/db/`, and restores it back. Three jobs do the work:
`web/db-backup.sh`, `web/db-restore.sh` and `web/db-list.sh` (the remote
listing lands in `web/db-backups.json`, so the page never talks to
SourceForge inside a request).

**The dump is always encrypted** (AES-256-GCM, `DB_BACKUP_KEY` in `.env`,
generated and printed once by `start.sh`). The release area is world
readable and the database holds the admin password hash, so `db-tool.mjs`
refuses to run without a key rather than falling back to plaintext. The file
header carries the key fingerprint in the clear, so a restore with the wrong
key says so instead of failing on an authentication error — the page shows
the current fingerprint. Keep a copy of the key off the VPS: without it an
uploaded backup cannot be restored.

The page also has an on/off switch for a **daily** backup. There is no cron in
the image and no second process to run one, so the panel schedules it itself:
`src/instrumentation.ts` starts `src/lib/scheduler.ts` once per server
process, which every 5 minutes asks whether today's automatic backup has
already been started and, once `AUTO_BACKUP_HOUR` (03:00 server time) has
passed, queues the same `db-backup` job the button queues. The "done today"
mark is a date in the `settings` table, so a container restart cannot cause a
second backup on the same day, and a VPS that was off at 03:00 gets its
backup when the panel comes back the same day. The date is written before the
job starts, so a failed backup shows up in the job history and is retried
tomorrow rather than every five minutes.

Details worth knowing:

- `users`, `jobs`, `settings`, `build_targets`, `package_lists` and `build_config` are dumped. `sessions.token` is the raw login
  cookie, so sessions never leave the machine — and a restore therefore never
  logs anyone out.
- The restore keeps its own job row (`plan()` passes a `__JOB_ID__`
  placeholder that `startJob` fills in with the new id), so the history does
  not end before the restore that produced it. Rows that were `running` in
  the backup come back as `unknown`.
- A restored admin hash that predates an `ADMIN_PASSWORD` change is re-hashed
  from the environment on the next login by `ensureAdmin()`.
- `mysqldump` is not usable here (Debian ships the MariaDB client, which
  cannot do `caching_sha2_password` against MySQL 8.4), so the dump is JSON
  written through mysql2 and restored with parameterised inserts. mysql2 is
  bundled into the Next server chunks, so the Dockerfile copies a standalone
  copy to `/app/tools/node_modules` for the script.
- `web.sourceforge.net` cannot run commands and its rsync is 3.1.4 (no
  `--mkpath`), so the upload syncs a staged `db/` directory — that is what
  creates the remote directory the first time.

## File page

`/files` browses the checkout itself, rooted at the repo (shortcuts for
`output/litegapps`, `log`, `web/job-logs`, `core/litegapps`, `packages`). Each
row has a three-dot menu: **Detail** (type, size — recursive for a directory,
mtime, mode, uid/gid, plus a text preview when the file is text), **Rename**,
**Pindahkan** (move into another directory) and **Hapus** (recursive for a
directory).

Every path goes through `safePath()` in `src/lib/files.ts`: it is resolved
against the repo root and refused if it escapes, and the names `.git`,
`.env`, `.ssh` and `node_modules` are refused at any depth, listing included —
the panel's own `.env` and the mounted ssh key must never be reachable from a
browser. Moving a directory into itself, renaming across directories, and
renaming to a blocked name are all refused. These are the real files: a
delete here is a delete on the VPS.

## Config page

`/config` edits the shell configs themselves: `config` (version, compression,
zip level, which products and variants a plain `sh build.sh make` builds),
`packages/config`, and each variant's `config`. Controls come from the key and
the `#` comment already in the file — booleans get a switch, `compression` and
the 1-9 levels get a select, variant/arch/SDK lists get chips.

Saving rewrites only the value of keys that are already in the file: comments,
blank lines, order and unrecognised keys are preserved byte for byte, and the
file is written through a temporary file and renamed. Values are single plain
lines (no control characters, no surrounding spaces), since the build reads
them with `grep | cut -d = -f 2`. A save is refused while a job is running,
because `build.sh` reads these files as it goes.

These files are tracked by git, so edits here show up in `git status` and are
reverted with `git checkout <file>`.

## Restore page

`/restore` restores build sources for one arch/SDK at a time. Its two tabs
follow the auto-build: **Package** fills `packages/files/<arch>/<sdk>` (the
download is cached in `packages/zip-server/`), and **LiteGapps** fills
`core/litegapps/<variant>/gapps/<arch>/<sdk>` for the ticked variants (cached
in `core/litegapps/<variant>/files/`). The ticks default to what
`MAKE_LITEGAPPS` in `sf-build.sh` builds for that target
(`sfBuildVariants()` in `src/lib/targets.ts`). What is shown as restored is
read from those directories on disk; what the server has comes from
`status.json`, which only covers the SDKs in `make-status.sh`'s `SDK_MAP`.

Package sources run 1–1.6 GB per arm64 target, so the page shows free disk
space and offers "Hapus source" to delete a target's sources once it is built.

## Server page

`/server` shows CPU, load, RAM, swap, the disk holding the checkout, uptime,
and host details, refreshing every 5 seconds. Inside the container `/proc`
and the kernel version already describe the host, but `/etc/hostname` and
`/etc/os-release` describe the image, so compose mounts the host's copies
under `/host`. With Docker installed as a snap, `/etc/os-release` resolves to
the snap base instead ("Ubuntu Core 24") — set
`HOST_OS_RELEASE=/var/lib/snapd/hostfs/etc/os-release`, as this VPS does.

## Exposure

The panel is plain http on the VPS's public address, and it can trigger
uploads to SourceForge with your release key. The password and session cookie
therefore cross the internet unencrypted. Ways to narrow that, cheapest first:

- `WEB_BIND=10.8.0.2` — listen on the WireGuard address only, so the panel is
  reachable over the VPN and not from the internet at all.
- A firewall rule allowing `WEB_PORT` from your own address only
  (`ufw` is currently inactive on this host).
- A strong `ADMIN_PASSWORD`.

The session cookie is marked `Secure` only when `SITE_URL` starts with
`https://`: browsers refuse to store a Secure cookie over plain http, which
would bounce every login straight back to the form.

## Not in the public copy

`web/` is excluded from the `git archive` export that syncs the repo to the
SourceForge FRS — that area is world-readable, and this directory carries the
compose file, `.env.example`, and the panel itself. Nothing here should ever
be copied there.
