#!/usr/bin/env bash
#################################################
# web/db-restore.sh
#
# Restore the panel database from a backup, downloading it from SourceForge
# first when it is not in web/db-backups/ any more.
#
# usage: bash web/db-restore.sh <litegapps-db-YYYYmmdd-HHMMSS.lgdb> [keep-job-id]
#
# keep-job-id is the id of the job running this restore: its row is kept so
# the history does not end before the restore that produced it.
#################################################
set -u
. "$(dirname "$(readlink -f "$0")")/db-common.sh"

NAME="${1:-}"
KEEP="${2:-}"
valid_name "$NAME" || { print "[ERROR] bad backup name <$NAME>"; exit 1; }
case "$KEEP" in ''|[0-9]*) ;; *) print "[ERROR] bad job id <$KEEP>"; exit 1 ;; esac

mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/$NAME"

print "==================================================="
print " Database restore"
print " File : $NAME"
print "==================================================="
print " "

if [ -f "$FILE" ]; then
	print "- Available locally : $FILE"
else
	need_sf
	print "- Downloading from $SF_USER@$SF_HOST:$SF_DB/$NAME"
	if ! rsync -a -e "ssh $SSH_OPTS" "$SF_USER@$SF_HOST:$SF_DB/$NAME" "$FILE"; then
		print "! Download failed"
		rm -f "$FILE"
		exit 1
	fi
fi

print "- Size : $(du -h "$FILE" | cut -f1)"
print " "
node "$BASED/db-tool.mjs" load "$FILE" $KEEP
