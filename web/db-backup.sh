#!/usr/bin/env bash
#################################################
# web/db-backup.sh
#
# Dump the panel database, encrypt it, and upload it to the SourceForge
# release area at <project>/db/. The dump itself is web/db-tool.mjs; this
# script only names the file, moves it, and refreshes the remote listing.
#
# usage: bash web/db-backup.sh [local]     ("local" skips the upload)
#################################################
set -u
. "$(dirname "$(readlink -f "$0")")/db-common.sh"

# Backups hold the admin password hash (encrypted, but still) - keep them
# out of reach of other accounts on the VPS.
umask 077

MODE="${1:-upload}"
NAME="litegapps-db-$(date '+%Y%m%d-%H%M%S').lgdb"
mkdir -p "$BACKUP_DIR"

print "==================================================="
print " Database backup"
print " File : $NAME"
print " Mode : $MODE"
print "==================================================="
print " "

node "$BASED/db-tool.mjs" dump "$BACKUP_DIR/$NAME" || exit 1
print "- Size : $(du -h "$BACKUP_DIR/$NAME" | cut -f1)"

if [ "$MODE" = local ]; then
	print "- Upload skipped (local only)"
	exit 0
fi

need_sf
print " "
print "- Uploading to $SF_USER@$SF_HOST:$SF_DB/"
# web.sourceforge.net is a restricted account: it cannot run mkdir, and its
# rsync (3.1.4) has no --mkpath. Syncing a staged directory is what creates
# <project>/db the first time, and it costs nothing afterwards.
STAGE="$(mktemp -d)"
mkdir -p "$STAGE/$(basename "$SF_DB")"
cp -p "$BACKUP_DIR/$NAME" "$STAGE/$(basename "$SF_DB")/"
if rsync -a -e "ssh $SSH_OPTS" "$STAGE/$(basename "$SF_DB")" "$SF_USER@$SF_HOST:$(dirname "$SF_DB")/"; then
	print "- Upload status : Successful"
	rm -rf "$STAGE"
else
	print "! Upload status : Failed - the backup is still in web/db-backups/"
	rm -rf "$STAGE"
	exit 1
fi

print " "
write_list
