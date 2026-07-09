---
name: build-litegapps
description: Understand and build the LiteGapps project — a systemless Google Apps package for Android built via build.sh. Use whenever the user wants to restore/build/clean LiteGapps, add SDK/Android or arch support, edit variants (lite, core, go, micro, pixel, nano, basic, user), manage gapps packages, tweak the config, or debug the build. Triggers: "build litegapps", "restore", "make gapps", "add A17/SDK support", "new variant", "auto-build".
---

# Build LiteGapps

LiteGapps is a small, systemless Google Apps package for Android, flashed as a
Magisk/Kopi module. This repo is the **build tool** that packages gapps files
into flashable zips. Everything is POSIX shell (`sh`/`bash`) — there is no
compiler, package manager, or test suite.

## Golden path (the three commands)

Run these from the repo root (`/home/peniru/litegapps`):

```bash
sh build.sh restore   # download bin.zip + gapps files (needs internet); do this ONCE first
sh build.sh make      # build zips based on config
sh build.sh clean     # wipe downloaded files, output, logs back to a clean tree
```

Build a single target, ignoring config, with:
```bash
bash build.sh make litegapps <variant> <arch> <sdk>
# example:
bash build.sh make litegapps lite arm64 36
```

Output lands in `output/litegapps/<arch>/<sdk>/<variant>/<date>/LiteGapps-*.zip`.
Logs are written to `log/make.log` and `log/make_live.log` — **read these first
when a build fails**, they contain the real error.

## Repo map

| Path | What it is |
|------|-----------|
| `build.sh` | Thin CLI + **dispatcher** + shared helpers (`printlog`, `get_config`, `make_zip`, `make_archive`, `make_tar_arch`, `copy_binary_flashable`, `get_android_version`, `clean_variant_dirs`, …). Subcommands `restore`/`make`/`clean`/`upload`/`update-gapps-server` call the product functions in `lib/`. Sources `lib/litegapps.sh` + `lib/litegappsx.sh`. |
| `lib/litegapps.sh`, `lib/litegappsx.sh` | Per-product build logic. Each defines `<product>_restore`, `<product>_make`, `<product>_clean` (+ `make_flashable_*`, `_<product>_build_variant`, `<product>_variants`). **Replaced the old `core/*/make.sh` and every per-variant `clean.sh`.** Variant list is derived from the filesystem (dirs containing a `config`), so adding a variant needs no code change. |
| `installer/` | Flashable-zip installer payload copied into every zip: `kopi/` installer, `customize.sh`, `action.sh`, `module.prop`, `LICENSE`, `27-litegapps.sh`, `litegapps-post-fs`, `litegapps`. Referenced in build code as **`$utils`** (set in `build.sh`). Was `core/utils/`. |
| `config` | Top-level build config (version, compression, which products/variants to build). See below. |
| `core/litegapps/restore.sh` | Downloads/extracts the gapps files for each variant during `restore` (sourced by `litegapps_restore`). |
| `core/litegapps/<variant>/` | One dir per variant (`lite core go micro pixel nano basic user`). Contains `config`, `restore/<arch>/<sdk>/`, `gapps/<arch>/<sdk>/` (populated by restore), `modules/`, `utils/README.md`. |
| `core/litegapps/<variant>/config` | Per-variant config: `sdk`, `arch`, `restore.sdk`, `restore.arch`, `name`, `dir_name`, `modules`, `desc`, plus the gapps-source overrides below. |
| `core/litegappsx/` | The "litegappsx" product — **`microg` only** now. Off by default (`litegappsx.build=false`). |
| `packages/` | Addon/apk packaging tool (`packages/make`, `packages/config`) — a vendored standalone sub-project called as a black box (`bash packages/make make $ARCH $SDK`), with its own `packages/utils` installer. Produces the raw gapps that get restored. |
| `files/` | Where `bin.zip` is downloaded to during restore. Gitignored. |
| `vps-build.sh` | **Unattended full build for a self-hosted VPS** (no time limit). Loops every `ARCH × SDK` from `.env`; per target: download package source from SourceForge → `packages/make make` (build addon) → scp addon to SF → download gapps → build every litegapps variant (via `build.sh make`) → scp zips to SF → **delete all sources/output before the next target** so a low-memory VPS holds only one target at a time. Failures are logged to `vps-build-logs/vps-build-failed.log` and the run continues. Its own consolidated log goes to `vps-build-logs/`, separate from `build.sh`'s `log/` (which appends across runs). Config via `.env` (gitignored: `SF_USER`, `ARCH_LIST`, `SDK_LIST`). Run detached (Docker via `Dockerfile`/`docker-compose.yml`, or `tmux`/`nohup`) so it survives SSH logout. Uploads reuse the proven scp-to-`web.sourceforge.net:/home/frs/project/litegapps/...` pattern. |
| `Dockerfile` / `docker-compose.yml` / `.dockerignore` | Containerized runner for `vps-build.sh` — clean env with all deps (curl, zip, tar, xz, brotli, unzip, java), SSH keys mounted read-only from the host, runs detached (`docker run -d` / `docker compose up -d`). |
| `auto-build.sh` | Legacy maintainer auto-build script run on the **SourceForge build VPS** (`$HOMEE=/home/frs/project/litegapps`). Interactive menu (arch/sdk prompt → Make Addon / Make LiteGapps / extract / release); builds every variant per SDK and stages releases to the Sourceforge project dir. Note: the SourceForge VPS enforces a **4-hour job time limit**, so builds must fit within that window — favor `litegapps.tar=single`/`multi` reuse and reasonable compression levels to stay under it. Meant for the release server, not casual local builds. |
| `bin/` | Per-arch binaries (`arm arm64 x86 x86_64`: zip, tar, xz, brotli, toybox) + `zipsigner.jar`. Downloaded by restore, gitignored. |

## config (top-level) — key fields

- `version` / `version.code` / `codename` — stamped into `module.prop`.
- `name.builder` — author name in the module.
- `build.status` — if it is `6070`/`wahyu6070`/`litegapps` the build is marked
  `official`, otherwise `unofficial` (see `build.sh` ~line 378).
- `compression` = `xz` or `brotli`; `compression.level` = 1–9. `zip.level` = 1–9.
- `zip.signer` = `true`/`false` — signs the zip with `bin/zipsigner.jar` (needs `java`).
- `litegapps.build` = `true`/`false` — build the litegapps product at all.
- `litegapps.restore` = comma list of variants to fetch during restore.
- `litegapps.type` = comma list of variants to build during make.
- `litegapps.tar` = `single` or `multi` — `multi` builds one shared `files.tar`
  reused across variants to speed up multi-variant builds.
- `litegappsx.*` — same knobs for the litegappsx product.

## Per-variant gapps source overrides (in `core/litegapps/<variant>/config`)

The gapps zip fetched during restore is normally uniform: `files-server/litegapps/<arch>/<sdk>/<sdk>.zip`.
Two optional keys change what gets fetched for a specific variant (`lib/litegapps.sh`,
`_litegapps_restore_variant`, the `GSUFFIX`/`GFILENAME` block):

- `restore.suffix=-lite` — fetch `<sdk><suffix>.zip` instead, e.g. `37-lite.zip`
  (this is what `lite` uses — SourceForge hosts a separate trimmed zip for it,
  confirmed against `files-server/litegapps/arm64/37/{37.zip,37-lite.zip}`).
- `restore.filename=superlite` — fetch a **fixed** name ignoring the sdk, e.g.
  `superlite.zip` in the same `<arch>/<sdk>/` dir (used by the `superlite`
  variant, which restores the original gapps release from when that Android
  version first shipped — the zip must be uploaded to SourceForge at
  `files-server/litegapps/<arch>/<sdk>/superlite.zip`).
- If neither is set, or the named/suffixed zip is missing on the server, it
  falls back to the plain `<sdk>.zip`.
- `restore.filename` wins over `restore.suffix` if both are set.

## How a build actually flows

1. `build.sh` detects host `ARCH` via `uname -m`, sets `$tmp`, `$bin`, `$log`, `$out`, `$utils`,
   and sources `lib/litegapps.sh` + `lib/litegappsx.sh`.
2. `MAKE` dispatches to `litegapps_make` (or `litegappsx_make`), which loops the
   variants in `litegapps.type` (or the CLI arg) with `BASED=core/litegapps/<variant>`.
3. For each `arch` × `sdk` from the variant's `config`: copies `gapps/<arch>/<sdk>`
   into `$tmp`, tars each app (`make_tar_arch`), compresses (`make_archive`), then
   `make_flashable_litegapps` assembles the Kopi module (binaries, `installer/` payload,
   `module.prop`, `files.tar.<comp>`) and zips it (`make_zip`).
4. `module.prop` fields are filled by `SED`-replacing placeholder tokens.

Restore follows the same dispatch shape: `RESTORE` → `litegapps_restore` /
`litegappsx_restore` → `_litegapps_restore_variant` / `_litegappsx_restore_variant`
per variant (see the gapps-source overrides above).

## Common tasks

**Add a new Android/SDK version** (e.g. A17 = SDK 37): add the mapping in
`get_android_version()` in `build.sh` (the `case` around line ~310), add the SDK
to the relevant variant `config` `sdk=`/`restore.sdk=`, and make sure the gapps
zip exists on the server for that `<arch>/<sdk>` (the A17=36 support commit
`98396d6` is the reference example — mirror what it changed).

**Add a new variant**: create `core/litegapps/<name>/config` (copy an existing
variant's as a template) — it's auto-discovered by `litegapps_variants` (any dir
under `core/litegapps/` containing a `config` file), no code changes needed.
Also create `core/litegapps/<name>/utils/README.md` (required — `make_flashable_litegapps`
errors if missing). Add it to `litegapps.type`/`litegapps.restore` in the top-level
`config` to include it in default builds, or build it explicitly:
`bash build.sh make litegapps <name> <arch> <sdk>`.

**Add/adjust a variant's app list**: variant contents for the maintainer flow
(`auto-build.sh`'s `PIXEL`/`MICRO`/`NANO`/`BASIC`/`USER`/`GO`/`CORE` whitelists) or
the `restore/<arch>/<sdk>/{core,gapps,go}` app-name lists control which extra
apps get pulled from `addon/` on top of the base gapps.

**Change compression/level or signing**: edit `config` — no code change needed.

**Debug a failing build**: `cat log/make.log` (now appends across runs, with a
timestamped `####` header per invocation — not wiped anymore, except by `clean`).
Errors abort via `ERROR`/`abort` which also delete `$tmp`. Check the "not found"
lines — usually missing `gapps/<arch>/<sdk>` (run `restore` first) or a missing
binary in `bin/<arch>`.

## Conventions & guardrails

- Match the existing shell style: tab indentation, helper functions defined at
  the top of `build.sh`, `getp`/`get_config`/`read_config` for reading config,
  `printlog`/`sedlog` for logging, `del`/`cdir` instead of raw `rm -rf`/`mkdir -p`.
- `restore` and `upload`/`update-gapps-server` hit the network (Sourceforge,
  GitHub). Don't run `upload`/`update-gapps-server` unless the user explicitly
  asks — they push to the release server and prompt for a Sourceforge username.
- Generated artifacts (`bin/`, `output/`, `*.zip`, `*.tar`, `*.apk`, gapps dirs,
  logs) are gitignored — don't commit them.
- Only commit or push when the user asks.
