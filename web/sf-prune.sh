#!/usr/bin/env bash
#################################################
# web/sf-prune.sh
#
# Keep only the newest releases of each variant on the SourceForge FRS.
#
# Releases live in <FRS>/litegapps/<arch>/<sdk>/<variant>/<YYYY-MM-DD>/.
# For every variant of one arch/sdk, the dated folders beyond the newest
# SF_KEEP_RELEASES (default 15) are deleted, oldest first. Folders whose name
# is not an ISO date (old "v3.0" or "20-02-2024" style releases) are neither
# counted nor touched.
#
# usage: bash web/sf-prune.sh <arch> <sdk> [--dry-run]
#
# SF_PRUNE=0 turns retention off (the panel's Build > Settings switch, or
# .env for vps-build.sh): nothing is listed or deleted.
#
# The FRS account (web.sourceforge.net) cannot run commands, so the listing
# comes from rsync --list-only and the deletion is an sftp batch of rm/rmdir.
# Anything that goes wrong while listing stops the prune: an empty or failed
# listing must never be read as "nothing to keep".
#
# Copyright 2020 - 2026 The LiteGapps Project
#################################################
set -u
. "$(dirname "$(readlink -f "$0")")/sf-common.sh"

ARCH="${1:-}"
SDK="${2:-}"
DRY_RUN=0
[ "${3:-}" = "--dry-run" ] && DRY_RUN=1

if [ "${SF_PRUNE:-1}" = 0 ]; then
	print "- Release retention is off (SF_PRUNE=0) - keeping every release"
	exit 0
fi

KEEP="${SF_KEEP_RELEASES:-15}"
# Where the release tree lives; only overridden to test against a scratch tree.
RELEASES="${SF_RELEASES:-$SF_FRS/litegapps}"

case "$ARCH" in
	arm64 | arm | x86 | x86_64) ;;
	*) print "[ERROR] bad arch <$ARCH>"; exit 1 ;;
esac
case "$SDK" in
	2[4-9] | 3[0-7]) ;;
	*) print "[ERROR] bad sdk <$SDK>"; exit 1 ;;
esac
case "$KEEP" in
	'' | *[!0-9]* | 0) print "[ERROR] SF_KEEP_RELEASES must be a positive number, got <$KEEP>"; exit 1 ;;
esac
need_sf
command -v sftp >/dev/null || { print "[ERROR] executable <sftp> not found"; exit 1; }

REMOTE="$RELEASES/$ARCH/$SDK"
print "- Pruning <$REMOTE>: keeping the newest $KEEP releases per variant"

# rsync --list-only: <perms> <size> <date> <time> <path relative to REMOTE>
if ! LISTING="$(rsync -r --list-only -e "ssh $SSH_OPTS" "$SF_USER@$SF_HOST:$REMOTE/" 2>/dev/null)"; then
	print "! could not list <$REMOTE> - not pruning"
	exit 1
fi
if [ -z "$LISTING" ]; then
	print "! empty listing for <$REMOTE> - not pruning"
	exit 1
fi

BATCH="$(mktemp)"
trap 'rm -f "$BATCH"' EXIT
REMOVED=""

VARIANTS="$(printf '%s\n' "$LISTING" | awk '$1 ~ /^d/ && $5 !~ /\// && $5 != "." { print $5 }')"
for V in $VARIANTS; do
	DATES="$(printf '%s\n' "$LISTING" \
		| awk -v v="$V" '$1 ~ /^d/ { print $5 }' \
		| grep -E "^$V/[0-9]{4}-[0-9]{2}-[0-9]{2}\$" \
		| sort)"
	COUNT="$(printf '%s\n' "$DATES" | grep -c .)"
	[ "$COUNT" -gt "$KEEP" ] || continue

	OLD="$(printf '%s\n' "$DATES" | head -n $((COUNT - KEEP)))"
	print "  $V: $COUNT releases, removing $((COUNT - KEEP)) oldest"
	for D in $OLD; do
		print "    - ${D#*/}"
		REMOVED="$REMOVED $V/${D#*/}"
		# files first, then directories deepest first, then the date folder
		printf '%s\n' "$LISTING" | awk -v d="$D/" '$1 !~ /^d/ && index($5, d) == 1 { print $5 }' \
			| while IFS= read -r F; do printf 'rm "%s/%s"\n' "$REMOTE" "$F"; done >> "$BATCH"
		printf '%s\n' "$LISTING" | awk -v d="$D/" '$1 ~ /^d/ && index($5, d) == 1 { print $5 }' \
			| sort -r | while IFS= read -r F; do printf 'rmdir "%s/%s"\n' "$REMOTE" "$F"; done >> "$BATCH"
		printf 'rmdir "%s/%s"\n' "$REMOTE" "$D" >> "$BATCH"
	done
done

if [ -z "$REMOVED" ]; then
	print "  nothing to prune"
	exit 0
fi

if [ "$DRY_RUN" = 1 ]; then
	print "  (dry run - nothing deleted)"
	exit 0
fi

if ! sftp $SSH_OPTS -b "$BATCH" "$SF_USER@$SF_HOST" >/dev/null 2>&1; then
	print "! sftp reported an error while pruning <$REMOTE>"
fi

# Trust the server, not the batch: every removed folder must really be gone.
AFTER="$(rsync -r --list-only -e "ssh $SSH_OPTS" "$SF_USER@$SF_HOST:$REMOTE/" 2>/dev/null | awk '$1 ~ /^d/ { print $5 }')"
LEFT=0
for R in $REMOVED; do
	if printf '%s\n' "$AFTER" | grep -qx "$R"; then
		print "! still there: <$REMOTE/$R>"
		LEFT=$((LEFT + 1))
	fi
done
[ "$LEFT" -eq 0 ] && print "  pruned:$REMOVED"
[ "$LEFT" -eq 0 ]
