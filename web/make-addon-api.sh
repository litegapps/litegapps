#!/usr/bin/env bash
#################################################
# web/make-addon-api.sh
#
# Regenerate the public addon index (web/api/addon/<arch>/<sdk>.json and
# index.json) from what is on the SourceForge FRS under addon/. The panel
# serves those files at /api/addon/... without a login; the LiteGapps
# Controller app reads them to list and download addons. The same list goes
# back to SourceForge as README.md in addon/, addon/<arch>/ and
# addon/<arch>/<sdk>/, which its Files page shows under each folder.
#
# usage: bash web/make-addon-api.sh              every target on SourceForge
#        bash web/make-addon-api.sh <arch> <sdk>  one target
#
# Reads SourceForge (rsync --list-only and the public RSS feed for md5), and
# writes only those README.md files back, so it is safe to run at any time.
# web/build-batch.sh runs it for a target after that target's addons were
# uploaded, and the panel every few days (File API > Otomatis).
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

print "- Reading $SF_FRS/addon/$BASE from $SF_HOST"
# TZ=UTC: rsync prints modification times in the local time zone, and the
# index stores UTC.
LIST="$(TZ=UTC rsync -r --list-only -e "ssh $SSH_OPTS" \
	"$SF_USER@$SF_HOST:$SF_FRS/addon/${BASE:+$BASE/}" 2>&1)"
RC=$?
if [ $RC -ne 0 ]; then
	# A failed listing must not turn into an empty index for the app.
	printf '%s\n' "$LIST" | tail -n 5
	print "! could not list addon/$BASE on SourceForge (rsync exit $RC) - index left as it was"
	exit 1
fi

printf '%s\n' "$LIST" | node "$SF_WEB/addon-api.mjs" "$BASE" || exit 1

# The same list as README.md files, which SourceForge shows under each folder
# of https://sourceforge.net/projects/litegapps/files/addon/. rsync -R creates
# the path (that account cannot mkdir) and skips files whose text did not
# change, since addon-api.mjs leaves those untouched. ADDON_README=0 skips it.
if [ "${ADDON_README:-1}" != 0 ] && [ -d "$SF_WEB/api/readme/addon" ]; then
	print "- Uploading README.md lists to $SF_FRS/addon"
	# From inside addon/: rsync may not set the project root's permissions
	# ("failed to set permissions on .../litegapps/.", exit 23), addon/ it may.
	OUT="$(cd "$SF_WEB/api/readme/addon" && rsync -a -R -v -e "ssh $SSH_OPTS" . "$SF_USER@$SF_HOST:$SF_FRS/addon/" 2>&1)"
	RC=$?
	# Only the files that went up; the rest is rsync's own chatter.
	printf '%s\n' "$OUT" | grep -E 'README\.md$' | sed 's|^|  addon/|'
	if [ $RC -ne 0 ]; then
		printf '%s\n' "$OUT" | tail -n 5
		print "! README upload failed (rsync exit $RC)"
		exit 1
	fi
fi
