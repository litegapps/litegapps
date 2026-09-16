#!/bin/bash
#################################################
# web/start.sh — one-shot deploy of the LiteGapps build panel.
#
#   bash web/start.sh
#
# Safe to run again at any time; every step is idempotent and the database
# volume is never removed. In order it:
#
#   1. git pull --ff-only (never creates a merge commit)
#   2. prepares .env: fills anything still empty, keeps what you set by hand
#   3. picks a free port if WEB_PORT is taken by another project
#   4. moves data from the old "web" compose project, once, if it exists
#   5. removes dangling images (build cache is kept, so rebuilds stay fast)
#   6. pre-pulls base images with retries
#   7. rebuilds the image only when files under web/ actually changed
#   8. starts MySQL + the panel
#   9. syncs the MySQL password with .env
#  10. waits until the panel answers, and prints where to open it
#
# Modelled on the unpackgamesnew start.sh.
#
# Copyright 2020 - 2025 The LiteGapps Project
#################################################

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
WEB_DIR="$(pwd)"
REPO_DIR="$(dirname "$WEB_DIR")"

#################################################
# Config
#################################################
# Compose project name. It prefixes the MySQL volume, so it must stay the
# same across deploys (it matches `name:` in docker-compose.yml).
COMPOSE_PROJECT="litegapps-web"
# Project the stack ran under before it had a fixed name.
LEGACY_PROJECT="web"
DB_VOLUME="${COMPOSE_PROJECT}_mysql_data"
LEGACY_DB_VOLUME="${LEGACY_PROJECT}_mysql_data"

BASE_IMAGES=(
	"node:22-bookworm-slim"
	"mysql:8.4"
)

HASH_FILE="$WEB_DIR/.last_deploy_hash"

if docker info >/dev/null 2>&1; then
	DOCKER="docker"
else
	DOCKER="sudo docker"
fi
COMPOSE="$DOCKER compose -p $COMPOSE_PROJECT"

#################################################
# Output
#################################################
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info(){ echo -e "${BLUE}$*${NC}"; }
ok(){ echo -e "${GREEN}$*${NC}"; }
warn(){ echo -e "${YELLOW}$*${NC}"; }
err(){ echo -e "${RED}$*${NC}"; }

step(){
	echo
	info "--- $* ---"
}

echo -e "${BLUE}========================================================================${NC}"
ok      "  LiteGapps build panel — deploy"
echo -e "${BLUE}========================================================================${NC}"

#################################################
# 0. Refuse to redeploy while a job is running
#
# Starting the stack recreates the web container, which kills whatever build,
# restore or upload it is running - the job dies half way and comes back as
# failed. So a deploy waits, unless --force says otherwise.
#################################################
FORCE=0
for arg in "$@"; do
	case "$arg" in
		-f | --force) FORCE=1 ;;
		*) err "[ERROR] unknown option <$arg>"; echo "usage: bash web/start.sh [--force]"; exit 1 ;;
	esac
done

running_job(){
	# The database is the panel's own record of what it started. A row only
	# counts as busy while the job really is: the panel settles finished rows
	# when a page is rendered, so a job that ended minutes ago can still read
	# "running" here, and its exit file is what proves otherwise.
	local line id label exitfile
	while IFS=$'\t' read -r id label exitfile; do
		[ -n "$id" ] || continue
		if [ -n "$exitfile" ] && [ -f "$exitfile" ]; then
			continue   # wrapper wrote its exit code: finished, just not reconciled
		fi
		echo "$id $label"
		return 0
	done <<EOF
$($COMPOSE exec -T mysql sh -c \
	'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "SELECT id, label, exit_file FROM litegapps.jobs WHERE status = '"'"'running'"'"'" 2>/dev/null' \
	2>/dev/null | sed "s#/litegapps/#$REPO_DIR/#")
EOF
}

build_lock_held(){
	# Held for as long as a build job runs, and by anything else that takes it.
	command -v flock >/dev/null || return 1
	flock -n "$WEB_DIR/.job.lock" -c true 2>/dev/null && return 1
	[ -f "$WEB_DIR/.job.lock" ]
}

step "0. Checking for running jobs"
BUSY=""
if $COMPOSE ps --status running 2>/dev/null | grep -q mysql; then
	BUSY="$(running_job)"
fi
if [ -z "$BUSY" ] && build_lock_held; then
	BUSY="a build process holds web/.job.lock"
fi

if [ -n "$BUSY" ]; then
	if [ "$FORCE" = 1 ]; then
		warn "[WARN] a job is still running: $BUSY"
		warn "       --force given: this deploy will kill it"
	else
		err "[ERROR] not deploying: a job is still running"
		err "        $BUSY"
		echo
		echo "  Deploying recreates the web container, which kills the running job and"
		echo "  leaves it recorded as failed. Wait for it to finish, or stop it first"
		echo "  with the Stop button in the job's terminal on the panel (recorded as"
		echo "  stopped), then deploy again. To force it: bash web/start.sh --force"
		exit 1
	fi
else
	ok "[OK] no job running"
fi

#################################################
# 1. git pull
#################################################
step "1. Updating code"
if git -C "$REPO_DIR" pull --ff-only origin main; then
	ok "[OK] code is up to date"
else
	warn "[WARN] git pull failed (local changes or no network) - deploying the local tree"
fi

#################################################
# 2. .env
#################################################
step "2. Preparing .env"

if [ ! -f .env ]; then
	cp .env.example .env
	chmod 600 .env
	ok "[OK] .env created from .env.example"
fi

gen(){ openssl rand -base64 36 | tr -dc 'A-Za-z0-9' | head -c "${1:-32}"; }

get_env(){
	grep "^$1=" .env | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}

set_env(){
	local key="$1" val="$2"
	if grep -q "^${key}=" .env; then
		val=$(printf '%s' "$val" | sed 's/[&|\\]/\\&/g')
		sed -i "s|^${key}=.*|${key}=${val}|" .env
	else
		echo "${key}=${val}" >> .env
	fi
}

# A value counts as unset when empty or still a template placeholder.
unset_env(){
	local v
	v="$(get_env "$1")"
	[ -z "$v" ] || [[ "$v" == *YOUR_* ]] || [[ "$v" == *CHANGE_ME* ]]
}

# Owner of the checkout: builds run as this user inside the container.
REPO_UID="$(stat -c %u "$REPO_DIR")"
REPO_GID="$(stat -c %g "$REPO_DIR")"
REPO_HOME="$(getent passwd "$REPO_UID" | cut -d: -f6 || true)"

if unset_env MYSQL_PASSWORD; then
	set_env MYSQL_PASSWORD "$(gen 32)"; ok "[OK] MYSQL_PASSWORD generated"
fi
if unset_env MYSQL_ROOT_PASSWORD; then
	set_env MYSQL_ROOT_PASSWORD "$(gen 32)"; ok "[OK] MYSQL_ROOT_PASSWORD generated"
fi
unset_env MYSQL_DATABASE && set_env MYSQL_DATABASE "litegapps"
unset_env MYSQL_USER && set_env MYSQL_USER "litegapps"

if unset_env ADMIN_USER; then
	set_env ADMIN_USER "admin"; ok "[OK] ADMIN_USER set to default (admin)"
fi
# Generated, never a fixed default: this script lives in a public repository,
# so any literal password here would be every fresh install's password.
GENERATED_ADMIN_PASSWORD=""
if unset_env ADMIN_PASSWORD; then
	GENERATED_ADMIN_PASSWORD="$(gen 16)"
	set_env ADMIN_PASSWORD "$GENERATED_ADMIN_PASSWORD"
	ok "[OK] ADMIN_PASSWORD generated (shown once at the end)"
fi

# Database backups are uploaded to the SourceForge release area, which is
# world readable, so they are always encrypted. No key, no backup.
GENERATED_DB_KEY=""
if unset_env DB_BACKUP_KEY; then
	GENERATED_DB_KEY="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
	set_env DB_BACKUP_KEY "$GENERATED_DB_KEY"
	ok "[OK] DB_BACKUP_KEY generated (shown once at the end)"
fi

if unset_env PUID; then set_env PUID "$REPO_UID"; fi
if unset_env PGID; then set_env PGID "$REPO_GID"; fi
if unset_env SSH_DIR && [ -n "$REPO_HOME" ]; then
	set_env SSH_DIR "$REPO_HOME/.ssh"; ok "[OK] SSH_DIR set to $REPO_HOME/.ssh"
fi
unset_env SSH_KEY_NAME && set_env SSH_KEY_NAME "id_rsa"
unset_env WEB_BIND && set_env WEB_BIND "0.0.0.0"
unset_env WEB_PORT && set_env WEB_PORT "3020"

# Snap Docker resolves /etc/os-release inside its snap base ("Ubuntu Core"),
# so the server page would report the wrong OS.
if unset_env HOST_OS_RELEASE; then
	if command -v snap >/dev/null && snap list docker >/dev/null 2>&1; then
		set_env HOST_OS_RELEASE "/var/lib/snapd/hostfs/etc/os-release"
		ok "[OK] snap Docker detected - HOST_OS_RELEASE points at the host filesystem"
	fi
fi

if [ ! -f "$(get_env SSH_DIR)/$(get_env SSH_KEY_NAME)" ]; then
	warn "[WARN] ssh key $(get_env SSH_DIR)/$(get_env SSH_KEY_NAME) not found - SourceForge access will fail"
fi

#################################################
# 3. Port
#################################################
step "3. Checking port"

# Is the port held by something other than this panel?
port_taken_by_other(){
	local port="$1" holder
	holder="$($DOCKER ps --format '{{.Names}} {{.Ports}}' | grep -E "[:.]${port}->" | awk '{print $1}' || true)"
	if [ -n "$holder" ]; then
		[ "$holder" != "litegapps-web" ]
		return
	fi
	# Not a container: any other listener on the host.
	ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${port}\$"
}

PORT="$(get_env WEB_PORT)"
if port_taken_by_other "$PORT"; then
	OLD="$PORT"
	while port_taken_by_other "$PORT"; do PORT=$((PORT + 1)); done
	set_env WEB_PORT "$PORT"
	warn "[WARN] port $OLD is used by another project - switched to $PORT"
fi
ok "[OK] panel port: $PORT"

# SITE_URL follows the address and port actually in use, unless set by hand
# to something else (https, a hostname).
SITE="$(get_env SITE_URL)"
if unset_env SITE_URL || [[ "$SITE" =~ ^http://[0-9.]+:[0-9]+/?$ ]]; then
	BIND="$(get_env WEB_BIND)"
	if [ "$BIND" = "0.0.0.0" ]; then
		HOST_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
	else
		HOST_IP="$BIND"
	fi
	set_env SITE_URL "http://${HOST_IP:-127.0.0.1}:$PORT"
fi

#################################################
# 4. One-time move from the old project name
#################################################
volume_exists(){ $DOCKER volume inspect "$1" >/dev/null 2>&1; }

if volume_exists "$LEGACY_DB_VOLUME" && ! volume_exists "$DB_VOLUME"; then
	step "4. Moving database from project \"$LEGACY_PROJECT\" to \"$COMPOSE_PROJECT\""
	# Stop the old stack first so MySQL is not copied mid-write. `down`
	# without -v keeps its volume.
	$DOCKER compose -p "$LEGACY_PROJECT" down --remove-orphans
	$DOCKER volume create \
		--label "com.docker.compose.project=$COMPOSE_PROJECT" \
		--label "com.docker.compose.volume=mysql_data" \
		"$DB_VOLUME" >/dev/null
	$DOCKER run --rm \
		-v "$LEGACY_DB_VOLUME:/from:ro" \
		-v "$DB_VOLUME:/to" \
		node:22-bookworm-slim sh -c 'cp -a /from/. /to/'
	ok "[OK] data copied into $DB_VOLUME"
	warn "[WARN] old volume $LEGACY_DB_VOLUME was kept - remove it once the panel checks out:"
	warn "       $DOCKER volume rm $LEGACY_DB_VOLUME"
else
	step "4. Database volume"
	ok "[OK] nothing to move"
fi

#################################################
# 5. Dangling images
#################################################
step "5. Removing dangling images"
$DOCKER image prune -f >/dev/null 2>&1 || true
ok "[OK] done (build cache kept)"

#################################################
# 6. Base images
#################################################
step "6. Pulling base images"
pull_retry(){
	local img="$1" n=0 max=4
	while [ $n -lt $max ]; do
		if $DOCKER pull -q "$img" >/dev/null 2>&1; then
			ok "[OK] $img"
			return 0
		fi
		n=$((n + 1))
		warn "[WARN] pull $img failed ($n/$max), retrying in $((n * 2))s"
		sleep $((n * 2))
	done
	warn "[WARN] continuing without pre-pulling $img"
}
for img in "${BASE_IMAGES[@]}"; do pull_retry "$img"; done

#################################################
# 7. Build, only when web/ changed
#################################################
step "7. Building image"

# Hash the files that go into the image rather than the git commit: a commit
# hash misses uncommitted edits, and would rebuild for changes outside web/.
source_hash(){
	find package.json package-lock.json tsconfig.json next.config.ts \
		Dockerfile docker-entrypoint.sh src -type f -print0 2>/dev/null \
		| sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1
}

CURRENT_HASH="$(source_hash)"
LAST_HASH="$(cat "$HASH_FILE" 2>/dev/null || true)"

if [ "$CURRENT_HASH" = "$LAST_HASH" ] && $COMPOSE images -q web 2>/dev/null | grep -q .; then
	ok "[OK] no changes since last deploy (${CURRENT_HASH:0:12}) - reusing the image"
else
	$COMPOSE build web
	echo "$CURRENT_HASH" > "$HASH_FILE"
	ok "[OK] image built (${CURRENT_HASH:0:12})"
fi

#################################################
# 8. Start
#################################################
step "8. Starting services"
$COMPOSE up -d --remove-orphans
ok "[OK] services started"

#################################################
# 9. MySQL password sync
#################################################
step "9. Waiting for MySQL"
n=0
until [ "$($DOCKER inspect -f '{{.State.Health.Status}}' litegapps-mysql 2>/dev/null)" = "healthy" ]; do
	n=$((n + 1))
	if [ $n -gt 60 ]; then
		err "[FATAL] MySQL did not become healthy"
		$COMPOSE logs --tail 30 mysql
		exit 1
	fi
	sleep 2
done
ok "[OK] MySQL is ready"

# MySQL reads MYSQL_PASSWORD only when the volume is first created. If .env
# changed since, the panel cannot log in to the database. Re-apply it on every
# deploy; the variables are expanded inside the container, so the password
# never appears on this host's command line.
if $COMPOSE exec -T mysql sh -c \
	'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "ALTER USER \`$MYSQL_USER\`@\"%\" IDENTIFIED BY \"$MYSQL_PASSWORD\"; FLUSH PRIVILEGES;"' \
	>/dev/null 2>&1; then
	ok "[OK] database password matches .env"
else
	warn "[WARN] could not sync the database password (MYSQL_ROOT_PASSWORD may have changed since the volume was created)"
fi

#################################################
# 10. Health check
#################################################
step "10. Waiting for the panel"
n=0
until code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/login")" && [ "$code" = "200" ]; do
	n=$((n + 1))
	if [ $n -gt 60 ]; then
		err "[FATAL] panel did not answer on port $PORT (last status: ${code:-none})"
		$COMPOSE logs --tail 40 web
		exit 1
	fi
	sleep 2
done
ok "[OK] panel answers"

if [ ! -f "$WEB_DIR/status.json" ]; then
	warn "[WARN] status.json is missing - use \"Segarkan status\" in the panel"
fi

if command -v ufw >/dev/null && sudo -n ufw status 2>/dev/null | grep -q "Status: active"; then
	if ! sudo -n ufw status | grep -qE "^$PORT(/tcp)?\s+ALLOW"; then
		warn "[WARN] ufw is active and port $PORT is not allowed: sudo ufw allow $PORT/tcp"
	fi
fi

echo
echo -e "${BLUE}========================================================================${NC}"
ok      "  Panel is up"
echo    "  Open  : $(get_env SITE_URL)"
if [ -n "$GENERATED_ADMIN_PASSWORD" ]; then
	echo    "  Login : $(get_env ADMIN_USER) / $GENERATED_ADMIN_PASSWORD   (new - also saved in web/.env)"
else
	echo    "  Login : $(get_env ADMIN_USER)  (password in web/.env)"
fi
if [ -n "$GENERATED_DB_KEY" ]; then
	echo    "  DB key: $GENERATED_DB_KEY"
	echo    "          (encrypts database backups - keep a copy somewhere else,"
	echo    "           without it an uploaded backup cannot be restored)"
fi
echo    "  Logs  : $COMPOSE logs -f web"
echo -e "${BLUE}========================================================================${NC}"
