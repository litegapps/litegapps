#!/usr/bin/env bash
#################################################
# web/gdrive-mirror.sh
#
# Mirror the build sources on the SourceForge FRS (files-server/: gapps,
# package, bin, base) to a Google Drive folder, so a second copy exists
# outside SourceForge.
#
# usage: bash web/gdrive-mirror.sh check   # what would be copied, Drive quota
#        bash web/gdrive-mirror.sh sync    # copy new/changed files to Drive
#
# Config (environment, set by the panel's Mirror page):
#   GDRIVE_REMOTE  rclone remote name for the Drive      (default: gdrive)
#   GDRIVE_DIR     folder inside that Drive              (default: litegapps-mirror)
#   RCLONE_CONFIG  rclone config holding the Drive token (default: rclone's own)
#
# The files are read straight from web.sourceforge.net over SFTP and streamed
# to Drive, so nothing is staged on this disk. That account cannot run
# commands, which is why the source remote turns off every rclone feature
# that would try (shell detection and remote md5sum/sha1sum): files are
# compared by size and modification time instead.
#
# "sync" only ever adds or replaces files on Drive - `rclone copy`, never
# `rclone sync` - so a file deleted on SourceForge by mistake is not deleted
# from the mirror too.
#
# The result is written to web/mirror-status.json for the panel to show; the
# page never calls rclone itself.
#
# Copyright 2020 - 2026 The LiteGapps Project
#################################################
set -u
. "$(dirname "$(readlink -f "$0")")/sf-common.sh"

MODE="${1:-}"
REMOTE="${GDRIVE_REMOTE:-gdrive}"
DIR="${GDRIVE_DIR:-litegapps-mirror}"
STATUS="$SF_WEB/mirror-status.json"
FOLDERS="litegapps package bin base"

case "$MODE" in
	check | sync) ;;
	*) print "usage: bash web/gdrive-mirror.sh check|sync"; exit 1 ;;
esac
case "$REMOTE" in
	'' | *[!A-Za-z0-9_-]*) print "[ERROR] bad remote name <$REMOTE>"; exit 1 ;;
esac
case "$DIR" in
	'' | /* | *..* | *[!A-Za-z0-9_./-]*) print "[ERROR] bad Drive folder <$DIR>"; exit 1 ;;
esac

command -v rclone >/dev/null || { print "[ERROR] rclone is not installed in this container"; exit 1; }
need_sf

if ! rclone listremotes 2>/dev/null | grep -qx "$REMOTE:"; then
	print "[ERROR] rclone has no remote <$REMOTE> - create it first (see the Mirror page)"
	exit 1
fi

KEY="${SF_SSH_KEY:-$HOME/.ssh/id_rsa}"
[ -f "$KEY" ] || { print "[ERROR] SourceForge key <$KEY> not found"; exit 1; }
SRC=":sftp,host=$SF_HOST,user=$SF_USER,key_file=$KEY,shell_type=none,disable_hashcheck=true,md5sum_command=none,sha1sum_command=none:$SF_FRS/files-server"
DST="$REMOTE:$DIR/files-server"

print "==================================================="
print " Mirror SourceForge sources to Google Drive ($MODE)"
print " From : $SF_HOST:$SF_FRS/files-server"
print " To   : $DST"
print "==================================================="

print " "
print "--- Drive quota ---"
rclone about "$REMOTE:" 2>&1 | sed 's/^/  /' || print "! could not read the Drive quota"

RC=0
print " "
if [ "$MODE" = check ]; then
	print "--- Files that a sync would copy (dry run) ---"
	rclone copy "$SRC" "$DST" --dry-run --stats-one-line --stats 0 -v 2>&1 \
		| grep -E "Skipped copy|NOTICE|ERROR|Transferred" | sed 's/^/  /'
	RC=${PIPESTATUS[0]}
else
	print "--- Copying new and changed files ---"
	rclone copy "$SRC" "$DST" \
		--transfers 4 --checkers 8 \
		--stats 30s --stats-one-line -v 2>&1 \
		| grep -vE "DEBUG" | sed 's/^/  /'
	RC=${PIPESTATUS[0]}
fi

# What the mirror holds now, per folder, for the page.
print " "
print "--- Mirror contents ---"
NOW="$(date -u '+%Y-%m-%d %H:%M UTC')"
{
	printf '{\n\t"generated": "%s",\n\t"mode": "%s",\n\t"ok": %s,\n' "$NOW" "$MODE" "$([ "$RC" -eq 0 ] && echo true || echo false)"
	printf '\t"remote": "%s",\n\t"dir": "%s",\n\t"folders": [\n' "$REMOTE" "$DIR"
	FIRST=1
	for F in $FOLDERS; do
		J="$(rclone size --json "$DST/$F" 2>/dev/null)"
		N="$(printf '%s' "$J" | sed -n 's/.*"count":\([0-9]*\).*/\1/p')"
		B="$(printf '%s' "$J" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
		print "  $F : ${N:-0} files, ${B:-0} bytes" >&2
		[ "$FIRST" = 1 ] || printf ',\n'
		FIRST=0
		printf '\t\t{ "name": "%s", "files": %s, "bytes": %s }' "$F" "${N:-0}" "${B:-0}"
	done
	printf '\n\t]\n}\n'
} > "$STATUS.tmp" && mv "$STATUS.tmp" "$STATUS"

print " "
if [ "$RC" -eq 0 ]; then
	print "- Mirror $MODE done"
else
	print "! rclone exited with $RC"
fi
exit "$RC"
