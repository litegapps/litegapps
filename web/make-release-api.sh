#!/usr/bin/env bash
#################################################
# web/make-release-api.sh
#
# Regenerate the public release index (web/api/litegapps/<arch>/<sdk>.json
# and index.json) from what is on the SourceForge FRS under litegapps/: the
# newest release of every variant per target, with link, md5 and upload
# time. The panel serves those files at /api/litegapps/... without a login.
#
# usage: bash web/make-release-api.sh              every target on SourceForge
#        bash web/make-release-api.sh <arch> <sdk>  one target
#
# Only reads from SourceForge (rsync --list-only and the public RSS feed for
# md5), so it is safe to run at any time. web/build-batch.sh runs it for a
# target after its zips were uploaded and old releases pruned, and the panel
# every few days (File API > Perbarui otomatis).
#################################################
set -u

. "$(dirname "$(readlink -f "$0")")/sf-common.sh"

A="${1:-}"
S="${2:-}"
BASE=""
if [ -n "$A" ] || [ -n "$S" ]; then
	case "$A" in arm64 | arm | x86 | x86_64) ;; *) print "! bad arch <$A>"; exit 1 ;; esac
	case "$S" in '' | *[!0-9]*) print "! bad sdk <$S>"; exit 1 ;; esac
	BASE="$A/$S"
fi

need_sf
command -v node >/dev/null || { print "[ERROR] executable <node> not found"; exit 1; }

print "- Reading $SF_FRS/litegapps/$BASE from $SF_HOST"
# TZ=UTC: rsync prints modification times in the local time zone, and the
# index stores UTC.
LIST="$(TZ=UTC rsync -r --list-only -e "ssh $SSH_OPTS" \
	"$SF_USER@$SF_HOST:$SF_FRS/litegapps/${BASE:+$BASE/}" 2>&1)"
RC=$?
if [ $RC -ne 0 ]; then
	# A failed listing must not turn into an empty index for the app.
	printf '%s\n' "$LIST" | tail -n 5
	print "! could not list litegapps/$BASE on SourceForge (rsync exit $RC) - index left as it was"
	exit 1
fi

printf '%s\n' "$LIST" | node "$SF_WEB/release-api.mjs" "$BASE"
