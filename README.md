![](https://github.com/litegapps/litegapps.github.io/raw/master/pages/images/new_i.png)
# LiteGapps

**LiteGapps** is a custom Google Apps package for Android — a systemless,
open-source gapps focused on being small, efficient, and comprehensive.
It's flashed as a Magisk/Kopi module.

This repo is the **build tool**: shell scripts that package gapps files into
flashable zips. It is not the gapps files themselves — those are restored
from SourceForge (see [Building](#building) below).

Website: [litegapps.github.io](https://litegapps.github.io)

## Requirements

``zip`` ``tar`` ``xz-utils`` ``unzip`` ``bash`` ``brotli`` ``curl``

### Termux
```bash
apt update && pkg upgrade && pkg install zip tar xz unzip bash brotli curl
```

### Ubuntu / Debian
```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y zip tar xz-utils unzip bash brotli curl
```

## Cloning

```bash
# https
git clone https://github.com/litegapps/litegapps.git
# ssh
git clone git@github.com:litegapps/litegapps.git
```

## Repo layout

| Path | What it is |
|---|---|
| `build.sh` | CLI + dispatcher (`restore`/`make`/`clean`/`upload`/`update-gapps-server`). |
| `lib/litegapps.sh`, `lib/litegappsx.sh` | Per-product build logic (restore/make/clean). Builds `packages/` addons and stages modules automatically for variants with `modules=true`. |
| `installer/` | Flashable-zip installer payload (Kopi installer, `customize.sh`, `action.sh`, `module.prop`, ...). |
| `config` | Top-level build config — see [Configure](#configure). |
| `core/litegapps/<variant>/` | One dir per variant: `lite core go micro pixel nano basic user superlite`. Each has its own `config`, and (after restore) `gapps/`, `files/`, `modules/`. |
| `core/litegappsx/microg/` | The `litegappsx` product — a microG-based build, off by default. |
| `packages/` | Addon/apk packaging tool used by variants with `modules=true` (pixel, micro, nano, basic, user, go, core). See `packages/README.md`. |
| `vps-build.sh` | Unattended multi-arch/sdk build + upload for a self-hosted VPS (no time limit). See [VPS / unattended builds](#vps--unattended-builds). |
| `auto-build.sh` | Legacy interactive build script for the SourceForge build VPS (4-hour job limit). |
| `.github/workflows/` | Build & publish to **your fork's** GitHub Releases via Actions — no VPS needed. See [Building via GitHub Actions](#building-via-github-actions). |

## Configure

Top-level `config`:

```
version=4.9                # version.code=49
codename=stable
name.builder=<your name>
build.status=official       # or unofficial / your name
set.time.stamp=true
date.time=202007122239

compression=br               # xz or br (brotli)
compression.level=1          # 1-9
zip.level=1                  # 1-9
zip.signer=false             # true/false

litegapps.build=true
litegapps.restore=lite       # comma-separated: lite,core,go,micro,pixel,nano,basic,user,superlite
litegapps.type=lite          # comma-separated, same list
litegapps.tar=single         # single or multi - reuse one files.tar across variants sharing gapps

litegappsx.build=false
litegappsx.restore=microg
litegappsx.type=microg
```

Per-variant `core/litegapps/<variant>/config`:

```
sdk=36                  # Android SDK / API level this zip is labelled as
arch=arm64               # arm, arm64, x86, x86_64 (comma-combine multiple)
restore.sdk=35            # actual gapps SDK to download - can differ from sdk=
restore.arch=arm64
modules=false             # true if this variant needs packages/ addons
name=LiteGapps
dir_name=lite
desc=...

# optional gapps-source overrides:
restore.suffix=-lite       # fetch <sdk><suffix>.zip instead of <sdk>.zip
restore.filename=superlite # fetch a fixed name, e.g. superlite.zip, ignoring sdk
```

## Building

Restore the binaries and gapps files first (needs internet):
```bash
sh build.sh restore
```

Build every variant/arch/sdk configured in `config`:
```bash
sh build.sh make
```

Build a single target, ignoring `config`:
```bash
bash build.sh make litegapps <variant> <arch> <sdk>
# example:
bash build.sh make litegapps lite arm64 35
```

Output: `output/litegapps/<arch>/<sdk>/<variant>/<date>/LiteGapps-*.zip`

Reset the tree (removes downloads, output, logs):
```bash
sh build.sh clean
```

Variants with `modules=true` (pixel, micro, nano, basic, user, go, core) also
need addon packages — `build.sh make` builds and stages those automatically
via `packages/make`, no extra step required.

## Building via GitHub Actions

Fork this repo and use the workflows under `.github/workflows/` to build and
publish straight to **your fork's** GitHub Releases — no SourceForge account,
SSH key, or VPS required:

- **`build-release.yml`** — builds `lite`/`superlite` (no addon packages
  needed, fast). Run manually from the Actions tab, or push a tag like `v1`.
- **`build-release-full.yml`** — builds every variant (`pixel` through
  `superlite` by default), including the `packages/` addon build. Configure
  `variants`/`arch`/`sdk` as workflow inputs, or push a tag like `full-v1`.

Both use the built-in `GITHUB_TOKEN`, so no secrets need to be configured.

## VPS / unattended builds

For building all arch/sdk targets and uploading to SourceForge yourself,
`vps-build.sh` runs unattended (no time limit, unlike the SourceForge build
VPS's 4-hour job cap):

```bash
cp .env.example .env   # set SF_USER (SourceForge login), ARCH_LIST, SDK_LIST
bash vps-build.sh
```

It loops every arch × sdk, restoring sources, building addons + every
variant, uploading to SourceForge via scp, and deleting sources/output
before the next target (low-memory friendly). Run it detached so it
survives SSH logout:

```bash
# Docker
docker compose up -d --build
# or tmux/nohup
nohup bash vps-build.sh > vps.log 2>&1 &
```

See `Dockerfile` / `docker-compose.yml` for the containerized setup (SSH
keys go in `docker/ssh/`, gitignored).

## Compression benchmark

![Benchmark](https://github.com/wahyu6070/Cloud/raw/main/project/litegapps/images/compres_lvl.jpg)

## Watch: building video

[<img src="https://img.youtube.com/vi/5ddkNReE2RE/maxresdefault.jpg" width="50%">](https://youtu.be/NiT2qBaYFdg?si=5VyyntICvjp5iseD)

## Download

[Click here](https://litegapps.github.io/)

## Social media

[Telegram](https://t.me/litegapps) · [XDA](https://forum.xda-developers.com/t/litegapps-systemless.4146013/)

## Credit

[OpenGapps](https://opengapps.org/) · [ApkPure](https://apkpure.com/) · [Kopi installer](https://github.com/wahyu6070/Kopi-installer)
