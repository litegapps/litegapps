# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

LiteGapps is a small, systemless Google Apps package for Android, flashed as a
Magisk/Kopi module. **This repo is the build tool** that packages gapps files
into flashable zips. The build itself is entirely POSIX shell (`sh`/`bash`)
with no compiler and no test suite; `web/` is the one exception — a Next.js
admin panel with its own `package.json`, which drives those same shell
scripts rather than replacing them.

For the full working guide, see the `build-litegapps` skill
(`.claude/skills/build-litegapps/SKILL.md`). `AGENTS.md` is the short version
of the rules in this file, for agents that do not read this one.

## Build commands

Run from the repo root:

```bash
sh build.sh restore   # download bin.zip + gapps files (needs internet); run ONCE first
sh build.sh make      # build zips per config
sh build.sh clean     # reset tree (removes downloads, output, logs)

# build a single target, ignoring config:
bash build.sh make litegapps <variant> <arch> <sdk>   # e.g. lite arm64 36

# restore a single target, ignoring config (variants comma separated):
sh build.sh restore bin                               # bin.zip only
sh build.sh restore litegapps <variant,...> <arch> <sdk>
bash packages/make restore <arch> <sdk>
```

With no arguments both `restore` commands behave as before and read their
config (`litegapps.restore` + each variant's `restore.arch`/`restore.sdk`, and
`packages/config`); the arguments only override it.

Output: `output/litegapps/<arch>/<sdk>/<variant>/<date>/LiteGapps-*.zip`
Logs: `log/make.log` and `log/make_live.log` — **read these first when a build fails.**

## Layout

- `build.sh` — thin CLI/dispatcher + shared helpers (`get_config`, `make_zip`,
  `make_archive`, `make_tar_arch`, `get_android_version`, `printlog`, `del`, `cdir`,
  `clean_variant_dirs`). Subcommands `restore`/`make`/`clean`/`upload`/`update-gapps-server`
  dispatch to the product functions in `lib/`.
- `installer/27-litegapps.sh` — addon.d script that keeps a Kopi (system) install
  across ROM updates. It is run by the ROM's backuptool in recovery
  (`backuptool.sh`, or `backuptool_ab.sh` at postinstall on A/B), once per stage
  and as a separate process. Follow that contract, never guess mount points:
  address files through `$S` (`$S/product/...`, `$S/system_ext/...`, which the
  V3 backuptool mounts), keep state in `$C` (A/B has no `/tmp`), and write only
  through `backup_file`/`restore_file`/`get_output_path` so A/B lands in the new
  slot under `/postinstall`. Keep the `. /tmp/backuptool.functions` line verbatim
  (backuptool_ab rewrites it) and use `exit`, not `return`, at top level. The
  install lists it replays (`list_install_<partition>`) are written by the Kopi
  `update-binary`, relative to each partition root. The previous version guessed
  `/mnt/product`, so GmsCore (product) and GSF (system_ext) were lost on every
  ROM update, and on A/B it restored nothing into the new slot.
- `lib/litegapps.sh` / `lib/litegappsx.sh` — per-product build logic, each exposing
  `<product>_restore`, `<product>_make`, `<product>_clean`. Sourced by `build.sh`.
  (This replaced the old `core/*/make.sh`, `core/litegapps/restore.sh`, and the
  per-variant `clean.sh` files — none of those exist any more.)
- `installer/` — flashable-zip installer payload copied into every zip (Kopi installer,
  `customize.sh`, `action.sh`, `module.prop`, `LICENSE`, post-fs scripts). Referenced as
  `$utils` in the build code. (Was `core/utils/`.) The build writes the zip's target
  into `module.prop` as `litegapps_arch=` / `litegapps_sdk=`, and `customize.sh`
  checks them against the device **before** touching `bin/<arch>`, so a wrong zip
  fails with "this zip is for arm, but this device is arm64" instead of a chmod
  error. On any failure `report_bug` writes the reason into the log before
  `make_log` packs it. The log is `[LOG]litegapps_<version>.tar.gz`, packed with
  the environment's own `tar`/`gzip` (toybox has `tar` since Android 7 and `gzip`
  since Android 9; Magisk/KernelSU/APatch busybox has both, and TWRP builds carry
  busybox or toybox) — never with a binary from the zip, which is absent on
  exactly that failure. `log_tool` finds them as linked applets on PATH, or
  through `busybox <applet>` / `toybox <applet>` for recoveries that ship the
  multi-call binary without applet symlinks. Without gzip it
  is a plain `.tar`; without tar the `log/` folder is kept. No `zip` binary is
  shipped in flashable zips any more.
- `config` — top-level build config (version, compression, which products/variants).
- `core/litegapps/<variant>/` — one dir per variant
  (`lite core go micro pixel nano basic user superlite`), each with its own `config`,
  `restore/`, `gapps/`, `modules/`, `utils/README.md`. They do not all restore the
  same gapps zip - see "Variants and where their gapps come from" below, which
  is the rule superlite, lite and go all hang off.
- `core/litegappsx/` — second product, `microg` only, off by default (`litegappsx.build=false`).
- `packages/` — addon/apk packaging tool (a vendored standalone sub-project; called as a
  black box via `bash packages/make make $ARCH $SDK`, has its own `packages/utils` installer).
- `sf-build.sh` — legacy maintainer auto-build, runs on the **SourceForge build VPS**
  (`$HOMEE=/home/frs/project/litegapps`) which has a **4-hour job time limit**;
  builds must fit that window. Interactive. Not for casual local builds.
  Menu option 6 ("Build All") batches through every arm64/arm/x86/x86_64 ×
  SDK 24-37 (Android 7.0-17) combination, `$BUILD_ALL_BATCH` (4) targets per
  run, tracked in `sf-build-progress.log` (gitignored) — stop, reboot the
  VPS job, and re-pick option 6 to resume where it left off.
  The checkout it runs from lives at `$HOMEE/build/litegapps`. Two different
  SourceForge hosts serve it, and they are not interchangeable:
  `ssh -t <user>@shell.sourceforge.net create` gives a real shell (this is the
  only way to *run* anything there), while `<user>@web.sourceforge.net` is a
  restricted account that can copy files but never execute a command.
  To push repo changes up, rsync a `git archive HEAD` export (no `--delete`,
  or you wipe the downloaded gapps under `bin/`, `core/**/gapps`, `output/`)
  and **exclude `web/`** — the FRS is world-readable and that directory holds
  the panel's compose file and `.env.example`; the SourceForge box does not
  run the panel anyway.
  Two things that trip this up: rsync cannot create or update dot-entries
  there — `.github/` and `.claude/` fail to mkdir, and the `.gitignore` already
  sitting there cannot be overwritten — so treat those as unsyncable; and the
  server keeps its own `config` tuned for releases (xz, compression 9, zip 9,
  `litegapps.tar=multi`) — leave it alone rather than overwriting it with the
  local one. `$HOMEE` is the public File Release System: everything placed
  there is downloadable by anyone, so never copy `.env` or keys into it.
- `vps-build.sh` — **unattended full build for a self-hosted VPS** (no time limit).
  Loops all ARCH × SDK, per target: download package source → build+upload addon →
  download gapps → build+upload every litegapps variant → **delete sources/output
  before the next target** (low-memory friendly). Config in `.env` (gitignored;
  `SF_USER` etc.). On failure it logs to `vps-build-logs/vps-build-failed.log` and
  continues. Its consolidated log lives in `vps-build-logs/`, separate from
  `build.sh`'s own `log/` (which appends across runs).
  Run detached so it survives SSH logout — via Docker (`Dockerfile` /
  `docker-compose.yml`) or `tmux`/`nohup`.
- `web/` — **build panel**: a Next.js app (MySQL + Docker) that runs the build work
  from a browser. The whole site is admin-only — `/` requires a login and every
  route sends `noindex`; it is opened directly at `http://<VPS IP>:3020` (no
  domain, no reverse proxy — `WEB_PORT` because 3000/3010 are taken by other
  projects on the VPS). The container imports only the SourceForge key from a
  read-only mount and runs as the host uid (`PUID`/`PGID`), so builds never
  leave root-owned files in the checkout. It never reimplements build logic: every action shells out to
  `build.sh` / `packages/make` / `web/make-status.sh` through a fixed allowlist
  in `src/lib/jobs.ts`, spawned as an argv array with no shell. Builds are
  guarded three ways: the running-job row, a scan for build processes started
  outside the panel (`src/lib/procs.ts`), and `flock -n web/.job.lock` held by
  the job process (the server must close its own copy of that fd, or the lock
  outlives the job). The
  availability matrix comes from `web/status.json` (written by
  `web/make-status.sh`, whose `SDK_MAP` covers Android 7.0-17, SDK 24-37),
  never from a live SourceForge call inside a request. Releases from before
  dated folders existed (zips straight in `<variant>/`, version in the name,
  e.g. `..._v2.5_official.zip` - all Android 7.0-8.0 has) are reported as
  `legacy` and shown as "v2.5 · lama".
  MySQL stores only the admin account, sessions, job history and panel settings
  (including the build forms' last selection, so they resume where they were).
  Every job's output is tailed by an inline terminal panel under the form that
  started it (`src/components/JobTerminal.tsx` + `Terminal.tsx`, fed by
  `?job=<id>` or `/api/jobs/running`); progress is parsed from the
  `=== [n/m] ... ===` markers the scripts print. A batch build also gets a
  progress table under the checklist (`src/components/BatchProgress.tsx` ->
  `/api/jobs/<id>/batch` -> `src/lib/batchlog.ts`): per target the addon step,
  every variant's state (queued / restoring / building / done / failed with
  the reason) and whether the zips reached SourceForge, plus how many builds
  are left and a rough ETA. It parses the log `web/build-batch.sh` already
  prints - the script keeps no state of its own - server-side, because that
  log grows to megabytes while the table stays a few KB. A successful upload
  prints no marker, so it is inferred from a release section that ends without
  `! zip upload failed`; `! addon upload failed` and `! prune failed` are
  warnings on the row, not upload failures. Keep those messages in step with
  the parser if the script's output changes. `/info` holds the release matrices (gapps/package source,
  published releases) and the status refresh.
  The build forms fold: `src/components/Fold.tsx` turns a form section into a
  drawer with a one-line summary when it is closed (Multi's target matrix,
  options and target detail; Config target's variant matrix; each package
  list), and the progress card folds away too (the state is remembered in
  `localStorage`) so
  a 33-row table does not bury the log below it. Each build tab (**Multi** and
  **Single**) also has a "Bersihkan data & log" button: it drops that tab's job
  rows and their log files (`clearJobs()`), then runs `web/clear-output.sh` as
  a job, which deletes `output/`, `packages/output/` and `log/` but keeps the
  sources under `bin/` and `core/*/gapps`. Unreleased zips are gone for good,
  so it confirms first and refuses while a job runs.
  `/` offers a checklist that turns ticked arch x SDK combinations into one
  batch job (`web/build-batch.sh`, continue-on-failure, optional auto-restore
  and per-target source cleanup). Which variants each target is built with
  and which addon apps go into each variant, come from the panel's "Config
  target" tab and live in its database (`build_targets`, `package_lists`),
  never in `config` or `core/*/config`: the panel resolves them before a job
  starts and passes them in argv (`<arch>:<sdk>=<variant,...>`) and in the
  environment (`LG_PKGS_<VARIANT>`, `LG_CORE_KEEP`, honoured by
  `lib/litegapps.sh`), then invokes
  `bash build.sh make litegapps <variant> <arch> <sdk>` per target, exactly
  like `LITE()`/`CORE()`/`PIXEL()` in `sf-build.sh`. Targets with no row
  follow `defaultVariants()`. The batch job can also build the addon per
  target (`MAKE_ADDON` equivalent) and, only when explicitly ticked, release
  addon and zips to the SourceForge FRS. The repo `config` is a **neutral
  default** (`name.builder=yourname`, `build.status=unofficial`) because anyone
  may clone and build; this VPS's identity and version (`version`,
  `version.code`, `codename`, `name.builder`, `build.status`) live in the panel
  database (`build_config`) and reach jobs as `LG_CFG_<key>` (dots become
  underscores), which `get_config()` in `build.sh` and `web/make-status.sh`
  read before the file. Never put a maintainer's builder name or official key
  back into the repo `config`. Compression, zip level and signer still come
  from the file. `/restore` restores sources per arch/SDK with the target arguments above,
  defaulting the gapps variants to the same per-target list the build uses, and
  `web/clean-sources.sh` deletes a target's sources again. `/config` edits the
  shell configs (`config`, `packages/config`, per-variant `config`) in place —
  it only ever replaces the value of a key the file already has, keeping
  comments and order, and refuses to save while a job runs. `/files` is a file
  manager over the checkout (detail/rename/move/delete per entry) with every
  path resolved inside the repo root and `.git`/`.env`/`.ssh`/`node_modules`
  refused at any depth.
  `/mirror` keeps a second copy of the **sources** (`files-server/`: gapps,
  package, bin, base - about 37 GB) on Google Drive, updated from SourceForge
  with `web/gdrive-mirror.sh check|sync`. rclone reads the FRS over SFTP with
  the same key as everything else (that account runs no commands, so the
  source remote uses `shell_type=none` and no remote hashing; files are
  compared by size and modification time) and streams straight to Drive, so
  nothing is staged on this disk. It is `rclone copy`, **never `rclone
  sync`** - the mirror only ever gains files, so a mistake on SourceForge
  cannot wipe it. The rclone token (a plaintext OAuth refresh token) lives
  **outside the checkout** in `${RCLONE_DIR:-~/.config/rclone}`, mounted
  read-only and copied into the container by `docker-entrypoint.sh`, exactly
  like the SourceForge key; `/files` and git therefore never see it. The page
  reads `web/mirror-status.json` (written by the job, gitignored) and
  `rcloneSetup()` for the local install - never rclone or the network inside a
  request. The target remote and folder live in `settings` (`mirror.remote`,
  `mirror.dir`). Every check/sync/file job also writes `web/mirror-files.json`
  (`rclone lsjson` of both sides, Drive with `--metadata` for its upload time)
  and appends each copy to `web/mirror-copied.tsv`, because Drive keeps the
  SourceForge mtime and its own creation time never moves on an update; the
  page's file list (`MirrorFileList.tsx`) shows per file whether the copy is
  current and a three-dot menu with **Update source** (`gdrive-mirror.sh file
  <path>`, job `mirror-file`) and **Detail** (last copied to Drive, last
  changed on SourceForge). rclone prints a stats block every 5 s
  (`--stats 5s --stats-file-name-length 0`); `src/lib/mirrorlog.ts` parses
  the latest one for the live per-file progress card (`MirrorProgress.tsx`).
  The pipes in that script must stay line-buffered (`grep --line-buffered`,
  `sed -u`) or the log - and the live view - stays empty until rclone exits.
  **Restore can download from the mirror**: Build > Settings "Sumber restore"
  (`settings` row `source.prefer`, `sf`/`drive`) reaches every job that can
  restore (`SOURCE_KINDS` in `jobs.ts`) as `LG_SOURCE` / `LG_GDRIVE_REMOTE` /
  `LG_GDRIVE_DIR`. `fetch_source()` in `build.sh` (gapps via
  `lib/litegapps.sh`, `bin.zip`) and its copy `fetch_package()` in
  `packages/make` then try `rclone copyto` from the mirror first and fall back
  to SourceForge when rclone is missing, the file is not mirrored or the copy
  fails `unzip -t`. Per-variant addon modules (`addon/`) are not mirrored and
  always come from SourceForge. Measured 2026-09-23 on the same 128 MB zip:
  Drive 22.7 MB/s, SourceForge 2 MB/s.
  `/backup` dumps the database (users + jobs; never
  sessions) with `web/db-tool.mjs`, **always AES-256-GCM encrypted** with
  `DB_BACKUP_KEY` because the upload target `$HOMEE/db` is world readable,
  and uploads it with rsync of a staged directory (that restricted account
  cannot mkdir and its rsync has no `--mkpath`). A switch on that page turns
  on a daily backup, run by an in-process scheduler
  (`src/instrumentation.ts` -> `src/lib/scheduler.ts`, state in the `settings`
  table) because the image has no cron.
  Deploy with **`bash web/start.sh`** (one-shot, idempotent) — it refuses to
  run while a panel job is running, since recreating the container kills it;
  `--force` overrides. Never start the
  stack under another compose project name than `litegapps-web` — it prefixes
  the MySQL volume, and a different name comes up with an empty database.
  **Never sync `web/` to the SourceForge FRS** — see the `sf-build.sh` note above.
  Details in `web/README.md`.
- `bin/`, `output/`, `files/`, gapps dirs, `*.zip/*.tar/*.apk`, logs — all gitignored.
  Careful with `.gitignore`: the artifact names there (`log`, `bin`, `output`,
  `files`, `tmp`) have no leading slash, so they match at **any** depth — that
  silently swallowed `web/src/app/api/jobs/[id]/log/`, hence the `!web/src/**`
  rule. Check `git check-ignore -v <path>` before assuming a new file is tracked.

## Working on the panel

- Deploy with `bash web/start.sh`; it refuses while a job runs (see the `web/`
  entry above) because recreating the container kills that job.
- Config the panel owns lives in **its database**, not in the repo: the
  build identity and version (`build_config`), the per-target variant list
  (`build_targets`), the per-variant package lists (`package_lists`), the
  daily-backup switch and the build forms' last selection (`settings`). The
  build gets them through argv and the environment, so `config` and
  `core/*/config` stay out of it except for compression, zip level and signer.
- Changing where a build reads its identity is a release-affecting change:
  make the new source hold the right values **before** anything can start a
  build with the old one gone. On 2026-09-16 the repo `config` was neutralised
  and the panel redeployed before `build_config` was filled; a release job
  started in between built `-unofficial` zips as `yourname` and uploaded seven
  of them to the FRS before it was stopped and they were deleted.
- Jobs are the only way the panel touches the tree, they are serialised three
  ways (running-job row, process scan, `flock`), and each one's output is
  tailed by the terminal panel on the page that started it.
- Verification is manual and against the live VPS panel — there is no test
  suite. See AGENTS.md for how.

## Conventions

- Match the existing shell style: tab indentation, config via `getp`/`get_config`/`read_config`,
  logging via `printlog`/`sedlog`, and `del`/`cdir` instead of raw `rm -rf`/`mkdir -p`.
- **Write everything inside files in English** — `#` comments, `print`/`ui_print` strings,
  log messages, commit messages. This is an English-language project. Some legacy
  Indonesian comments exist in the tree; do not add more, and do not mirror the
  language of the chat into the code (replying to the user in Indonesian is fine).
- `restore` and `upload`/`update-gapps-server` hit the network (Sourceforge, GitHub).
  **Do not run `upload`/`update-gapps-server` unless explicitly asked** — they push to
  the release server and prompt for a Sourceforge username.
- Do not commit generated/gitignored artifacts.
- Only commit or push when the user asks.

## Variants and where their gapps come from

The variants are **not** the same files with different app lists: three
different gapps bases feed them, which is why several rules elsewhere in this
file key on the variant.

| Variant | gapps zip restored | Set by |
|---|---|---|
| core, pixel, micro, nano, basic, user, go | `<sdk>.zip` | (default) |
| lite | `<sdk>-lite.zip`, falling back to `<sdk>.zip` when the server has none | `restore.suffix=-lite` |
| superlite | `superlite.zip` | `restore.filename=superlite` |

**superlite is the odd one**: that zip is the gapps release the Android version
originally shipped with, so its app versions differ from every other variant of
the same SDK. It must always be built from its own gapps - never from another
variant's files - which is what the per-gapps-base cache key below guarantees.
Both superlite and go are built for arm64 SDK 29+ only (see Supported
targets).

## Releasing to SourceForge

`web/build-batch.sh` uploads **per target, not per variant**: all variants of
one `<arch>/<sdk>` are built first, then `release_target` sends the addon tree
and the zip tree in one `rsync -a -R -v` each (`-R` is what creates the remote
directories - that account cannot run `mkdir`). Consequences worth knowing:

- Zips appear on the FRS in bursts, one target at a time; a run stopped
  mid-target uploads nothing for that target.
- rsync exits non-zero (23) if **any single file** fails and names it, so one
  bad file marks the whole target `! zip upload failed <A/S>`, and the prune is
  then skipped so no old release is lost over a broken upload. `-v` lists every
  file that went up.
- A target whose builds all failed has no output directory; that prints
  `- nothing to upload <A/S>` instead of passing silently as a success.
- `vps-build.sh` differs on purpose: it uploads **per variant**, right after
  each one is built, with `scp_tree`.

## Reading a failed batch run

A batch job continues past a failure and ends non-zero; the panel's progress
table lists every failure with its reason. In practice they are almost always
the **sources**, not the build code, so read the reason before touching
anything:

- `restore gagal` with `! <path> is not on SourceForge either` - that source
  zip exists nowhere (seen on `arm/32`, `arm/33`, `x86_64/31-33`). Downloads
  use `curl -f`, so SourceForge's 404 page (~48 KB of HTML) is no longer
  saved as the zip and misreported as `Extract status : Failed`.
- `! <...>-lite.zip not on the Drive mirror ... falling back` followed by
  `<N-lite.zip> unavailable, falling back to N.zip` is normal for lite on
  non-arm64 targets: their `-lite.zip` sources were deleted on purpose.
- `! file <packages/zip-server/<arch>/<sdk>.zip> is not found` - no addon
  source for that target; only the addon step fails, the zips still build.
- `source tidak ada` - the gapps were missing and auto-restore was off.

Rebuild only the failed targets afterwards (checklist, or Build > Satu
perintah); nothing in the run needs to be repeated wholesale.

## Release retention on SourceForge

Each variant folder on the FRS (`litegapps/<arch>/<sdk>/<variant>/`) keeps only
its **newest 15 dated releases** (`YYYY-MM-DD` folders, `SF_KEEP_RELEASES`
overrides the number); after a release is published the older ones are deleted.
Every publishing path applies it: the panel batch and `vps-build.sh` call
`web/sf-prune.sh <arch> <sdk>` after a successful upload (remote, via
`rsync --list-only` + an sftp `rm`/`rmdir` batch, verified by relisting, and it
refuses to prune on a failed or empty listing), and `sf-build.sh` runs
`PRUNE_RELEASES` locally since it writes to the FRS directly. Folders that are
not ISO dates (old `v3.0` or `20-02-2024` releases) are neither counted nor
deleted. `web/sf-prune.sh ... --dry-run` shows what would go.
`SF_PRUNE=0` turns it off. In the panel both the switch and the count live in
Build > Settings (`settings` rows `release.prune` / `release.keep`) and reach
batch jobs as `SF_PRUNE` / `SF_KEEP_RELEASES`; `vps-build.sh` takes them from
`.env`.

## Compression: smallest output first

`files.tar` is compressed with **`xz -T0 -9e`** (`make_archive` in
`build.sh`), and the zip around it with `zip -9`. The thread count is the
`corecompressing` key in `config`: `multi` (default, `-T0`, every core) or
`single` (`-T1`); the output is the same size either way. The repo `config`
carries the key too (editable from the panel's `/config`), because the
`/config` editor can only change keys a file already has. **xz is used because it is
designed to make the output as small as possible**, and that is the goal for
every release: the maintainer chose `-9e` and zip level 9 on purpose, so do
not lower them or trade size for speed.

`-T0` only adds threads. xz splits its input into blocks and compresses one
block per thread; at `-9` the default block is 3 x the 64 MiB dictionary =
192 MiB, so a `files.tar` smaller than that is still one block on one core,
and a 260 MiB one is two blocks. That default is kept deliberately - do **not**
add `--block-size`. Measured 2026-09-23 on a real 260 MiB arm64/36 tar with
8 cores:

| xz options | time | output |
|---|---|---|
| `-9e` (before) | 262 s | 94.01 MiB |
| `-9e -T0` (used) | 190-199 s | 94.14 MiB |
| `-9e -T0 --block-size=32MiB` | 36 s | 94.98 MiB (+1 %) |

The smaller blocks were rejected: faster, but every release would grow ~1 %.
A multi-block `.xz` is plain standard xz: the `xz` in `bin.zip` (XZ Utils
5.2.4, what devices decompress with) and busybox `unxz` (XZ Embedded) both
read it byte-identical. `BIN_TEST` prefers the host's own `xz` and only falls
back to `bin/<arch>/xz`, which is an Android binary and hangs on the VPS - so
the host must have xz installed (the panel image does). `zip -9` on an
already-xz'd file costs ~3 s and is not worth parallelising.

## Shared files.tar (litegapps.tar=multi)

`litegapps.tar=multi` in `config` (editable from the panel's `/config`) makes
one arch/SDK build its `files.tar.<compression>` once and reuse it for the
other variants, instead of running xz again per variant. It is a **per
arch/SDK** cache, not one archive for several architectures.

The variants do not all restore the same gapps, so the cache in
`tmp_files/litegapps/<arch>/<sdk>/<gapps base>/` is keyed by gapps source as
well: `sdk` (`<sdk>.zip`, most variants), `sdk-lite` (`lite`, `<sdk>-lite.zip`)
and `superlite` (`superlite.zip`). **superlite carries a different gapps
version** - the release the Android version originally shipped with - so it
must always build from its own gapps and never inherit another variant's
archive; the key is what guarantees that, in `_litegapps_build_variant`
(`lib/litegapps.sh`). Keying it by arch/SDK alone would have put pixel's files
in the lite and superlite zips.

## Supported targets

Android 7.0 (SDK 24) is the **oldest** target on every arch; Android 5.0, 5.1
and 6.0 (SDK 21-23) were dropped. The floor is `MIN_SDK` in `build.sh`
(checked by `target_supported()`, copied into `packages/make`) and in
`web/src/lib/targets.ts`, whose `SDKS`/`ANDROID` no longer list 21-23. The
panel's shell argument checks (`web/build-batch.sh`, `web/sf-prune.sh`,
`web/clean-sources.sh`), `vps-build.sh` and the full GitHub workflow start at
24 too. Releases already published for 21-23 stay on the FRS. The device-side
`get_android_version()` copies in `installer/` and `packages/utils/` keep the
21-23 names on purpose, so an old zip still prints its Android version when it
is flashed.

x86 (32-bit) is supported **up to Android 11 (SDK 30) only** and arm (32-bit)
**up to Android 16 (SDK 36) only**; arm64 and x86_64 have no limit. The rule
lives in `target_supported()` / `X86_LAST_SDK` in `build.sh` (copied into standalone `packages/make`, and applied in
`sf-build.sh`, `vps-build.sh` and both GitHub workflows), and in
`targetSupported()` / `X86_LAST_SDK` in `web/src/lib/targets.ts` for the
panel, which refuses such jobs server-side and disables those cells in its
forms. Reason: Android 11 is the last version Google published a 32-bit x86
phone image with GMS for, and x86 was ~0.5% of downloads (Sep 2025–Sep 2026).
The cut-off was SDK 35 until 2026-09-23, when it moved down to SDK 30; x86
releases already on the FRS for SDK 31-35 were left in place. Do not add x86
builds for SDK 31+; keep both copies of the constant in step if it ever moves.
The arm cut-off is `ARM_LAST_SDK` next to it, in the same places (and
`unsupported_reason()` / `unsupportedReason()` name the right one in skip
messages and refused jobs). Reason, checked 2026-09: Google's SDK repository
has no armeabi-v7a image after SDK 25 and the Android 16/17 GSIs are arm64 and
x86_64 only; MindTheGapps ships Android 17 for arm only as an Android TV
build; LineageOS (newest 23.2 = Android 16) maintains no 32-bit arm phone at
all. Do not add arm builds for SDK 37+.

The **go** and **superlite** variants are built for **arm64 Android 10 (SDK
29) and up only**: go because Google's Go apps it is made of do not exist for
the other targets, superlite because it is only released for that range
(since 2026-09-23; before that arm/x86/x86_64 got it from SDK 29). The rule is
`variant_supported()` / `GO_MIN_SDK` in `build.sh` (checked by both the make
and the restore loop in `lib/litegapps.sh`), `GO()` in `sf-build.sh`,
`variants_for()` in `vps-build.sh`, and `variantSupported()` in
`web/src/lib/targets.ts`, which the panel uses to disable the go box on other
targets, drop it from stored per-target lists, and refuse such jobs.

## Adding Android/SDK support

Add the SDK→version mapping in `get_android_version()` in `build.sh` (the `case`
around line 296), add the SDK to the relevant variant `config` (`sdk=`/`restore.sdk=`),
and ensure `restore/<arch>/<sdk>/` gapps exist. Commit `98396d6` (A17 = SDK 36) is
the reference example.

## In progress (handoff, updated 2026-09-23)

Read this first; delete it once everything below is done.

**Google Drive source mirror** is live: first sync (job #65, 2026-09-22,
~5 h, no errors) copied all of `files-server/` - litegapps 56 files, package
37, bin 1, base 5, ~37 GB - to `gdrive:litegapps-mirror/files-server`, and a
check afterwards found nothing left to copy. Things learned setting it up:
- The token is **reused from `../unpackgamesnew/.env`** (`GDRIVE_CLIENT_ID`,
  `GDRIVE_CLIENT_SECRET`, `GDRIVE_REFRESH_TOKEN`, full `drive` scope, same
  Google account, 5 TiB). The refresh token does not expire; rclone refreshes
  the hourly access token itself.
- rclone **rejects a `token` whose `access_token` is empty** ("Loaded invalid
  token ... ignoring") and then overwrites it without the refresh token. Build
  `rclone.conf` with a real access token from one refresh call plus its
  expiry, and never print the file (it holds the client secret).
- `web/start.sh` does not recreate the container when the image is unchanged,
  so a new or changed `~/.config/rclone/rclone.conf` needs
  `sudo docker compose -p litegapps-web restart web` for the entrypoint to
  copy it in.
- Restoring from the mirror is wired in and verified (panel job #70 restored
  lite arm64/29 from Drive; a missing Drive folder fell back to SourceForge).
  The setting was left on **Google Drive** after that test.

**Other open items:**
- Missing sources on SourceForge (the cause of every failed restore):
  gapps `arm/32`, `arm/33`, `x86_64/31-33`; addon `package/arm/31`,
  `x86/29`, `x86_64/29`, `x86_64/31`. They now fail with "not on SourceForge
  either" instead of a bogus extract error; the files still need uploading.
- 2026-09-23: the non-arm64 `files-server/litegapps/*/<sdk>-lite.zip` were
  deleted on the user's request (arm/34-36, x86/35, x86_64/34-37); lite on
  those targets now restores from `<sdk>.zip`.
- Offered, not done: `sf.mirror=phoenixnap` in `config` (measured 18 MB/s vs
  9 MB/s default) - the user decides.
- Unproven: the per-gapps-base `files.tar` cache key - build lite and superlite
  for one target with `litegapps.tar=multi` and marker files, then compare the
  two zips' `files.tar.xz`, on a free tree.
