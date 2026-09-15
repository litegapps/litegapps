#!/usr/bin/bash
#################################################
# web/make-status.sh
#
# Regenerate web/status.json from the SourceForge files-server listing.
#
# The status page (web/index.html) reads that JSON and draws the
# arch x SDK availability matrix, so refreshing the site after an upload
# is one command:
#
#   bash web/make-status.sh
#
# It only ever READS from SourceForge (rsync --list-only over ssh), so it
# is safe to run at any time. Needs the ssh key of SF_USER to be set up
# already, same as vps-build.sh.
#
# Config comes from .env (gitignored) exactly like vps-build.sh; any
# variable already set in the environment wins, so a one-off run can do:
#
#   SF_USER=someone bash web/make-status.sh
#
# Copyright 2020 - 2025 The LiteGapps Project
#################################################

BASED="$(dirname "$(readlink -f "$0")")"
ROOT="$(dirname "$BASED")"

#################################################
# Load .env  (gitignored, holds SF_USER etc.)
#################################################
if [ -f "$ROOT/.env" ]; then
	while IFS='=' read -r _k _v; do
		case "$_k" in ''|\#*) continue ;; esac
		_v=${_v%\"}; _v=${_v#\"}          # strip surrounding double quotes
		eval "_cur=\${$_k+SET}"
		[ "$_cur" = SET ] || eval "export $_k=\$_v"
	done < "$ROOT/.env"
	unset _k _v _cur
fi

#################################################
# Config (override any of these in .env)
#################################################
SF_USER="${SF_USER:-}"                                  # SourceForge username (required)
SF_HOST="${SF_HOST:-web.sourceforge.net}"               # host that serves the FRS over ssh
SF_FRS="${SF_FRS:-/home/frs/project/litegapps}"         # remote release root
ARCH_LIST="${ARCH_LIST:-arm64 arm x86 x86_64}"          # column order on the page

# SDK -> Android version, oldest first. Keep in sync with
# get_android_version() in build.sh when a new SDK is added.
SDK_MAP="${SDK_MAP:-27:8.1 28:9 29:10 30:11 31:12 32:12.1 33:13 34:14 35:15 36:16 37:17}"

# Normally ssh picks the key on its own (that is what vps-build.sh relies on).
# Set SF_SSH_KEY when this machine has a ~/.ssh/config entry for SF_HOST that
# points at a different account, which would otherwise be used instead.
SF_SSH_KEY="${SF_SSH_KEY:-}"

OUT="$BASED/status.json"

print(){ echo "$1"; }

if [ -z "$SF_USER" ]; then
	print "[ERROR] SF_USER is not set - put it in .env or pass SF_USER=... "
	exit 1
fi

for W in rsync ssh awk; do
	if ! command -v "$W" >/dev/null; then
		print "[ERROR] executable <$W> not found"
		exit 1
	fi
done

#################################################
# Read the two source trees off SourceForge
#################################################
# files-server/litegapps/<arch>/<sdk>/{<sdk>.zip,<sdk>-lite.zip,superlite.zip}
# files-server/package/<arch>/<sdk>.zip
SSH_OPTS="-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30"
[ -n "$SF_SSH_KEY" ] && SSH_OPTS="$SSH_OPTS -i $SF_SSH_KEY -o IdentitiesOnly=yes"

list_remote(){
	rsync -r --list-only \
		-e "ssh $SSH_OPTS" \
		"$SF_USER@$SF_HOST:$SF_FRS/files-server/$1/" 2>/dev/null
}

# rsync --list-only prints: <perms> <size> <date> <time> <path>
paths_of(){
	printf '%s\n' "$1" | awk 'NF>=5 && $1 !~ /^d/ { print $5 }'
}

print "- Reading $SF_FRS from $SF_HOST"

GAPPS_RAW="$(list_remote litegapps)"
if [ -z "$GAPPS_RAW" ]; then
	print "[ERROR] could not list files-server/litegapps - check ssh access for $SF_USER"
	exit 1
fi
PKG_RAW="$(list_remote package)"

GAPPS="$(paths_of "$GAPPS_RAW")"
PKG="$(paths_of "$PKG_RAW")"

print "- Found $(printf '%s\n' "$GAPPS" | grep -c .) gapps files, $(printf '%s\n' "$PKG" | grep -c .) package files"

have(){
	printf '%s\n' "$2" | grep -qxF "$1"
}

#################################################
# Released zips: <arch>/<sdk>/<variant>/<date>/<zip>
#################################################
REL_RAW="$(rsync -r --list-only -e "ssh $SSH_OPTS" \
	"$SF_USER@$SF_HOST:$SF_FRS/litegapps/" 2>/dev/null)"
REL="$(paths_of "$REL_RAW")"

# Keep only real dated release dirs (older uploads used "v3.0" style dirs).
REL_TUPLES="$(printf '%s\n' "$REL" | awk -F/ \
	'NF==5 && $4 ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/ { print $1, $2, $3, $4 }' \
	| sort -u)"

# One line per arch+sdk: "<arch> <sdk> <latest date> <variant,variant,...>"
REL_SUMMARY="$(printf '%s\n' "$REL_TUPLES" | awk '
	{
		key = $1 " " $2
		if ($4 > latest[key]) { latest[key] = $4; vars[key] = $3 }
		else if ($4 == latest[key]) { vars[key] = vars[key] "," $3 }
	}
	END { for (k in latest) print k, latest[k], vars[k] }
' | sort)"

LATEST_DATE="$(printf '%s\n' "$REL_TUPLES" | awk '{ print $4 }' | sort | tail -n1)"

print "- Found $(printf '%s\n' "$REL_TUPLES" | grep -c .) released builds, newest ${LATEST_DATE:-none}"

rel_date(){
	printf '%s\n' "$REL_SUMMARY" | awk -v a="$1" -v s="$2" '$1==a && $2==s { print $3 }'
}
rel_variants(){
	printf '%s\n' "$REL_SUMMARY" | awk -v a="$1" -v s="$2" '$1==a && $2==s { print $4 }'
}

# JSON array from a comma separated list, e.g. core,go,lite -> ["core","go","lite"]
json_list(){
	printf '%s' "$1" | tr ',' '\n' | sort -u | awk '
		NF { printf "%s\"%s\"", (n++ ? ", " : ""), $0 }
		END { if (!n) printf "" }
	'
}

#################################################
# Project version (from the repo config)
#################################################
cfg(){ grep "^$1=" "$ROOT/config" 2>/dev/null | head -n1 | cut -d = -f 2-; }

V_VERSION="$(cfg version)"
V_CODE="$(cfg version.code)"
V_CODENAME="$(cfg codename)"
V_STATUS="$(cfg build.status)"

#################################################
# Emit status.json
#################################################
{
	printf '{\n'
	printf '\t"generated": "%s",\n' "$(date -u '+%Y-%m-%d %H:%M UTC')"
	printf '\t"version": { "version": "%s", "code": "%s", "codename": "%s", "status": "%s" },\n' \
		"$V_VERSION" "$V_CODE" "$V_CODENAME" "$V_STATUS"
	printf '\t"latest_release": "%s",\n' "$LATEST_DATE"

	printf '\t"archs": ['
	FIRST=true
	for A in $ARCH_LIST; do
		$FIRST || printf ', '
		FIRST=false
		printf '"%s"' "$A"
	done
	printf '],\n'

	printf '\t"sdks": [\n'
	FIRST=true
	for M in $SDK_MAP; do
		$FIRST || printf ',\n'
		FIRST=false
		printf '\t\t{ "sdk": %s, "android": "%s" }' "${M%%:*}" "${M##*:}"
	done
	printf '\n\t],\n'

	printf '\t"targets": {\n'
	AFIRST=true
	for A in $ARCH_LIST; do
		$AFIRST || printf ',\n'
		AFIRST=false
		printf '\t\t"%s": {\n' "$A"
		SFIRST=true
		for M in $SDK_MAP; do
			S="${M%%:*}"
			$SFIRST || printf ',\n'
			SFIRST=false
			G=false; L=false; SL=false; P=false
			have "$A/$S/$S.zip"        "$GAPPS" && G=true
			have "$A/$S/$S-lite.zip"   "$GAPPS" && L=true
			have "$A/$S/superlite.zip" "$GAPPS" && SL=true
			have "$A/$S.zip"           "$PKG"   && P=true
			RD="$(rel_date "$A" "$S")"
			RV="$(json_list "$(rel_variants "$A" "$S")")"
			printf '\t\t\t"%s": { "gapps": %s, "lite": %s, "superlite": %s, "package": %s, "release": "%s", "variants": [%s] }' \
				"$S" "$G" "$L" "$SL" "$P" "$RD" "$RV"
		done
		printf '\n\t\t}'
	done
	printf '\n\t}\n'
	printf '}\n'
} > "$OUT"

print "- Wrote $OUT"
