# web/ — LiteGapps build panel

A Next.js app that runs the build work from a browser instead of the VPS
terminal: pick a target, start the job, watch the log, and see what already
exists on the SourceForge release server.

**The whole site is the admin panel.** There is no public page — `/` requires
a login and the app sends `noindex` on every route. It is opened directly at
`http://<VPS IP>:<WEB_PORT>` (default 3020), with no domain or reverse proxy.

## How it works

The panel never reimplements build or upload logic. It shells out to the
scripts that already own it:

| panel command | what runs |
|---|---|
| Build varian | `bash build.sh make litegapps <variant> <arch> <sdk>` |
| Build packages | `bash packages/make make <arch> <sdk>` |
| Restore | `sh build.sh restore` |
| Clean | `sh build.sh clean` |
| Segarkan status | `bash web/make-status.sh` |

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
| `src/app/` | routes — `/` (Build), `/server` (VPS stats), `/login`, `/api/jobs/[id]/log`, `/api/server` |
| `src/lib/` | `db`, `session`, `jobs`, `status`, `targets`, `paths`, `sysinfo` |
| `src/components/` | UI — matrix, build form, job list, theme toggle |
| `make-status.sh` | regenerates `status.json` from the SourceForge listing |
| `status.json` | **generated — do not hand-edit**, re-run the script |

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

When a new SDK is added, extend `SDK_MAP` in `make-status.sh` and `SDKS` in
`src/lib/targets.ts`, alongside `get_android_version()` in `build.sh`.

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
