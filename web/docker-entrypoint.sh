#!/bin/sh
#
# Container start-up, run as root, then drop to the host user.
#
# 1. Run as the host user (PUID/PGID). The panel builds inside the bind-
#    mounted checkout; as root, build.sh would leave output/, log/, bin/ and
#    web/job-logs owned by root, and `sh build.sh clean` or vps-build.sh run
#    from the host account could no longer delete them.
#
# 2. Import the SourceForge ssh key. The host's ssh directory is mounted
#    read-only at /ssh-host and cannot be used in place: ssh refuses a key or
#    config that belongs to another user, and mounting it whole would expose
#    every key on the host. Only the key named SSH_KEY_NAME and known_hosts
#    are copied. The host's ssh config is deliberately NOT copied - it may map
#    web.sourceforge.net to a different account and override this key.
set -e

PUID="${PUID:-1001}"
PGID="${PGID:-1001}"
SRC=/ssh-host
KEY_NAME="${SSH_KEY_NAME:-id_rsa}"

# ssh aborts with "No user exists for uid" when the uid has no passwd entry.
getent group "$PGID" >/dev/null || echo "builder:x:$PGID:" >> /etc/group
getent passwd "$PUID" >/dev/null || \
	echo "builder:x:$PUID:$PGID:LiteGapps builder:/home/builder:/bin/bash" >> /etc/passwd
HOME_DIR="$(getent passwd "$PUID" | cut -d: -f6)"

mkdir -p "$HOME_DIR/.ssh"
chmod 700 "$HOME_DIR/.ssh"

if [ -f "$SRC/$KEY_NAME" ]; then
	cp "$SRC/$KEY_NAME" "$HOME_DIR/.ssh/id_rsa"
	chmod 600 "$HOME_DIR/.ssh/id_rsa"
	echo "[entrypoint] imported ssh key <$KEY_NAME>"
else
	echo "[entrypoint] WARNING: ssh key <$SRC/$KEY_NAME> not found - SourceForge access will fail"
fi
if [ -f "$SRC/known_hosts" ]; then
	cp "$SRC/known_hosts" "$HOME_DIR/.ssh/known_hosts"
	chmod 600 "$HOME_DIR/.ssh/known_hosts"
fi
chown -R "$PUID:$PGID" "$HOME_DIR"

# Job logs written by an earlier root-run container would be unwritable now.
if [ -d "${REPO_ROOT:-/litegapps}/web/job-logs" ]; then
	chown -R "$PUID:$PGID" "${REPO_ROOT:-/litegapps}/web/job-logs"
fi
chown -R "$PUID:$PGID" /app/.next 2>/dev/null || true

echo "[entrypoint] running as uid $PUID gid $PGID"
exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups \
	env HOME="$HOME_DIR" "$@"
