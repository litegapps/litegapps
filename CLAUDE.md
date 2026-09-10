# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

LiteGapps is a small, systemless Google Apps package for Android, flashed as a
Magisk/Kopi module. **This repo is the build tool** that packages gapps files
into flashable zips. Everything is POSIX shell (`sh`/`bash`) — there is no
compiler, package manager, or test suite.

For the full working guide, see the `build-litegapps` skill
(`.claude/skills/build-litegapps/SKILL.md`).

## Build commands

Run from the repo root:

```bash
sh build.sh restore   # download bin.zip + gapps files (needs internet); run ONCE first
sh build.sh make      # build zips per config
sh build.sh clean     # reset tree (removes downloads, output, logs)

# build a single target, ignoring config:
bash build.sh make litegapps <variant> <arch> <sdk>   # e.g. lite arm64 36
```

Output: `output/litegapps/<arch>/<sdk>/<variant>/<date>/LiteGapps-*.zip`
Logs: `log/make.log` and `log/make_live.log` — **read these first when a build fails.**

## Layout

- `build.sh` — thin CLI/dispatcher + shared helpers (`get_config`, `make_zip`,
  `make_archive`, `make_tar_arch`, `get_android_version`, `printlog`, `del`, `cdir`,
  `clean_variant_dirs`). Subcommands `restore`/`make`/`clean`/`upload`/`update-gapps-server`
  dispatch to the product functions in `lib/`.
- `lib/litegapps.sh` / `lib/litegappsx.sh` — per-product build logic, each exposing
  `<product>_restore`, `<product>_make`, `<product>_clean`. Sourced by `build.sh`.
  (This replaced the old `core/*/make.sh` and the per-variant `clean.sh` files.)
- `installer/` — flashable-zip installer payload copied into every zip (Kopi installer,
  `customize.sh`, `action.sh`, `module.prop`, `LICENSE`, post-fs scripts). Referenced as
  `$utils` in the build code. (Was `core/utils/`.)
- `config` — top-level build config (version, compression, which products/variants).
- `core/litegapps/restore.sh` — restore logic (still sourced by `litegapps_restore`).
- `core/litegapps/<variant>/` — one dir per variant (`lite core go micro pixel nano basic user`),
  each with its own `config`, `restore/`, `gapps/`, `modules/`, `utils/README.md`.
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
- `vps-build.sh` — **unattended full build for a self-hosted VPS** (no time limit).
  Loops all ARCH × SDK, per target: download package source → build+upload addon →
  download gapps → build+upload every litegapps variant → **delete sources/output
  before the next target** (low-memory friendly). Config in `.env` (gitignored;
  `SF_USER` etc.). On failure it logs to `vps-build-logs/vps-build-failed.log` and
  continues. Its consolidated log lives in `vps-build-logs/`, separate from
  `build.sh`'s own `log/` (which appends across runs).
  Run detached so it survives SSH logout — via Docker (`Dockerfile` /
  `docker-compose.yml`) or `tmux`/`nohup`.
- `bin/`, `output/`, `files/`, gapps dirs, `*.zip/*.tar/*.apk`, logs — all gitignored.

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

## Adding Android/SDK support

Add the SDK→version mapping in `get_android_version()` in `build.sh` (the `case`
around line 296), add the SDK to the relevant variant `config` (`sdk=`/`restore.sdk=`),
and ensure `restore/<arch>/<sdk>/` gapps exist. Commit `98396d6` (A17 = SDK 36) is
the reference example.
