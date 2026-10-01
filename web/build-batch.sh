#!/usr/bin/env bash
#################################################
# web/build-batch.sh
#
# Build many targets in one job, so the panel can offer a checklist instead
# of one build per click. Per target it optionally restores the gapps source
# first, builds every selected variant, and optionally deletes the sources
# again - the same order vps-build.sh uses, minus the uploads.
#
# usage: bash web/build-batch.sh <targets> <restore> <clean> [addon] [upload]
#
#   targets   "<arch>:<sdk>=<variant,variant,...>" per target, separated by ";"
#             e.g. "arm64:36=lite,pixel;arm:36=core"
#             an empty variant list means: skip that target
#             "<arch>:<sdk>@<steps>=<variants>" sets the addon/upload steps
#             for that target alone, instead of the addon/upload flags below:
#             <steps> is any of "fresh", "addon", "upload" joined by "+", or
#             empty (neither addon nor upload). "fresh" deletes the target's
#             sources first (web/clean-sources.sh), so they are restored anew
#             instead of reusing a broken or half-finished download.
#             The panel's retry uses it to redo only what failed, e.g.
#             "arm64:36@fresh+upload=lite;arm:30@fresh+addon=" restores and
#             rebuilds lite arm64/36 and releases that target again, and only
#             restores and rebuilds arm/30's addon.
#   restore   1 = restore missing sources first, 0 = build what is on disk
#   clean     1 = delete the target's sources after it is built, 0 = keep
#   addon     1 = build the addon packages for the target first
#             (bash packages/make make <arch> <sdk>)
#   upload    1 = release the results to SourceForge afterwards:
#             addon -> <FRS>/addon/<arch>/<sdk>/, then the public addon
#                      index web/api/addon/<arch>/<sdk>.json is regenerated
#             zips  -> <FRS>/litegapps/<arch>/<sdk>/<variant>/<date>/
#             then only the newest 15 dated releases per variant are kept
#             (web/sf-prune.sh, SF_KEEP_RELEASES) and the public release
#             index web/api/litegapps/<arch>/<sdk>.json is regenerated
#
# The panel resolves the variant list per target (Build > Config target,
# stored in its database) and passes it here, so this script never reads any
# build config itself.
#
# A failing target is logged and the run continues; the exit code is non-zero
# when anything failed.
#
# Copyright 2020 - 2025 The LiteGapps Project
#################################################
set -u

BASED="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
cd "$BASED" || exit 1

. "$(dirname "$(readlink -f "$0")")/sf-common.sh"

TARGETS="${1:-}"
DO_RESTORE="${2:-1}"
DO_CLEAN="${3:-0}"
DO_ADDON="${4:-0}"
DO_UPLOAD="${5:-0}"

ALL_VARIANTS="lite core go micro pixel nano basic user superlite"

die(){ echo "! $1"; exit 1; }

[ -n "$TARGETS" ] || die "no target given"
case "$DO_RESTORE" in 0 | 1) ;; *) die "bad restore flag <$DO_RESTORE>" ;; esac
case "$DO_CLEAN" in 0 | 1) ;; *) die "bad clean flag <$DO_CLEAN>" ;; esac
case "$DO_ADDON" in 0 | 1) ;; *) die "bad addon flag <$DO_ADDON>" ;; esac
case "$DO_UPLOAD" in 0 | 1) ;; *) die "bad upload flag <$DO_UPLOAD>" ;; esac
# "<arch>:<sdk>[@<steps>]=<variants>" -> validated
# "<arch> <sdk> <addon> <upload> <has steps> <variants>" lines
PLAN="$(printf '%s\n' "$TARGETS" | tr ';' '\n')"
PARSED=""
TOTAL=0
ANY_ADDON=0
ANY_UPLOAD=0
for ENTRY in $PLAN; do
	[ -n "$ENTRY" ] || continue
	TARGET="${ENTRY%%=*}"
	LIST="${ENTRY#*=}"
	T_ADDON="$DO_ADDON"
	T_UPLOAD="$DO_UPLOAD"
	T_FRESH=0
	HAS_STEPS=0
	case "$TARGET" in
		*@*)
			HAS_STEPS=1
			T_ADDON=0
			T_UPLOAD=0
			for STEP in $(echo "${TARGET#*@}" | tr '+' ' '); do
				case "$STEP" in
					addon) T_ADDON=1 ;;
					upload) T_UPLOAD=1 ;;
					fresh) T_FRESH=1 ;;
					*) die "bad step <$STEP>" ;;
				esac
			done
			TARGET="${TARGET%%@*}"
			;;
	esac
	A="${TARGET%%:*}"
	S="${TARGET#*:}"

	case "$A" in
		arm64 | arm | x86 | x86_64) ;;
		*) die "bad arch <$A>" ;;
	esac
	case "$S" in
		2[4-9] | 3[0-7]) ;;
		*) die "bad sdk <$S>" ;;
	esac
	for V in $(echo "$LIST" | tr ',' ' '); do
		echo "$ALL_VARIANTS" | tr ' ' '\n' | grep -qx "$V" || die "bad variant <$V>"
		TOTAL=$((TOTAL + 1))
	done
	[ "$T_ADDON" = 1 ] && ANY_ADDON=1
	[ "$T_UPLOAD" = 1 ] && ANY_UPLOAD=1
	PARSED="$PARSED$A $S $T_ADDON $T_UPLOAD $T_FRESH $HAS_STEPS $LIST
"
done
[ "$ANY_UPLOAD" = 1 ] && need_sf

# The steps a target runs, for its plan line: "[steps: fresh,addon,upload]".
steps_of(){
	local out=""
	[ "$3" = 1 ] && out="fresh"
	[ "$1" = 1 ] && out="${out:+$out,}addon"
	[ "$2" = 1 ] && out="${out:+$out,}upload"
	echo "${out:-none}"
}

# took <start epoch>: "3m12s" since then, for the per-step timings in the log
took(){
	local s=$(( $(date +%s) - $1 ))
	printf '%dm%02ds' $((s / 60)) $((s % 60))
}

has_gapps(){
	local D="$BASED/core/litegapps/$1/gapps/$2/$3"
	[ -d "$D" ] && [ -n "$(ls -A "$D" 2>/dev/null)" ]
}

# Addon packages for one target, the MAKE_ADDON step of the release build:
# no config is read, the target comes from the arguments.
build_addon(){
	local A="$1" S="$2"
	if [ ! -d "$BASED/packages/files/$A/$S" ]; then
		if [ "$DO_RESTORE" != 1 ]; then
			echo "! package source missing and restore is off - skipping addon"
			return 1
		fi
		echo "- package source missing, restoring"
		bash "$BASED/packages/make" restore "$A" "$S" || return 1
	fi
	bash "$BASED/packages/make" make "$A" "$S"
}

# Release to the SourceForge FRS. rsync -R recreates <arch>/<sdk> under the
# destination, which is how the directories get created: that account cannot
# run mkdir and its rsync has no --mkpath.
upload_dir(){
	local SRC_ROOT="$1" REL="$2" DEST="$3"
	# Nothing built for this target (every variant failed, or the addon was
	# not built): say so rather than passing silently for "uploaded".
	if [ ! -d "$SRC_ROOT/$REL" ]; then
		echo "- nothing to upload <$REL> from <$SRC_ROOT>"
		return 0
	fi
	echo "- Uploading <$REL> to <$DEST>"
	# -v names every file that goes up, so the log shows what was released and
	# not just that the target succeeded. rsync exits non-zero (23) when even
	# one file fails, which is what marks the whole target failed below.
	( cd "$SRC_ROOT" && rsync -a -R -v -e "ssh $SSH_OPTS" "./$REL" "$SF_USER@$SF_HOST:$DEST/" )
}

release_target(){
	local A="$1" S="$2"
	echo " "
	echo "--- Release $A/$S to SourceForge ---"
	if upload_dir "$BASED/packages/output" "$A/$S" "$SF_FRS/addon"; then
		# The public addon index (/api/addon/<arch>/<sdk>.json, read by the
		# LiteGapps Controller app) follows every addon upload.
		if [ -d "$BASED/packages/output/$A/$S" ]; then
			bash "$BASED/web/make-addon-api.sh" "$A" "$S" || echo "! addon api failed <$A/$S>"
		fi
	else
		echo "! addon upload failed <$A/$S>"
	fi
	if upload_dir "$BASED/output/litegapps" "$A/$S" "$SF_FRS/litegapps"; then
		# Keep the newest SF_KEEP_RELEASES (15) releases per variant; only after
		# a successful upload, so a failed one never costs an old release.
		bash "$BASED/web/sf-prune.sh" "$A" "$S" || echo "! prune failed <$A/$S>"
		# The public release index (/api/litegapps/<arch>/<sdk>.json) follows
		# the new release, after the prune so it never points at a deleted one.
		bash "$BASED/web/make-release-api.sh" "$A" "$S" || echo "! release api failed <$A/$S>"
	else
		echo "! zip upload failed <$A/$S>"
	fi
}

echo "==================================================="
echo " Batch build"
echo " Targets  : $(printf '%s' "$PLAN" | grep -c .)"
echo " Builds   : $TOTAL"
# Addon/Upload say whether any target runs that step; a target that does
# not names its own steps on its plan line.
echo " Restore  : $DO_RESTORE   Clean : $DO_CLEAN   Addon : $ANY_ADDON   Upload : $ANY_UPLOAD"
echo "==================================================="
echo " "
printf '%s' "$PARSED" | while read -r A S TA TU TF HS LIST; do
	[ -n "$A" ] || continue
	if [ "$HS" = 1 ]; then
		echo " - $A sdk $S : ${LIST:-(none)} [steps: $(steps_of "$TA" "$TU" "$TF")]"
	else
		echo " - $A sdk $S : ${LIST:-(skipped)}"
	fi
done
echo " "

if [ "$DO_RESTORE" = 1 ] && [ ! -d "$BASED/bin/arm64" ]; then
	echo "--- bin/ is missing, restoring it first ---"
	sh build.sh restore bin || die "bin restore failed"
	echo " "
fi

#################################################
# Build
#################################################
NUM=0
OK=0
FAILED=0
FAILED_LIST=""

# A pipe would run the loop in a subshell and lose the counters.
OLD_IFS="$IFS"
IFS='
'
for LINE in $PARSED; do
	IFS="$OLD_IFS"
	set -- $LINE
	A="$1"; S="$2"; T_ADDON="$3"; T_UPLOAD="$4"; T_FRESH="$5"; HAS_STEPS="$6"
	LIST="$(echo "${7:-}" | tr ',' ' ')"

	# No variant skips the target, unless it was given steps of its own (a
	# retry that only rebuilds the addon or only uploads again).
	if [ -z "$LIST" ] && { [ "$HAS_STEPS" != 1 ] || [ "$T_ADDON$T_UPLOAD" = 00 ]; }; then
		echo " "
		echo "=== $A sdk $S: no variant selected - skipping ==="
		IFS='
'
		continue
	fi

	if [ "$T_FRESH" = 1 ]; then
		echo " "
		echo "--- fresh sources for $A/$S ---"
		bash "$BASED/web/clean-sources.sh" "$A" "$S"
	fi

	if [ "$T_ADDON" = 1 ]; then
		echo " "
		echo "=== addon $A sdk $S ==="
		T0=$(date +%s)
		if build_addon "$A" "$S"; then
			echo "- addon ok <$A $S> ($(took "$T0"))"
		else
			echo "! addon failed <$A $S>"
			FAILED=$((FAILED + 1)); FAILED_LIST="$FAILED_LIST addon/$A/$S"
		fi
	fi

	for V in $LIST; do
		NUM=$((NUM + 1))
		echo " "
		echo "=== [$NUM/$TOTAL] $V $A sdk $S ==="

		if ! has_gapps "$V" "$A" "$S"; then
			if [ "$DO_RESTORE" = 1 ]; then
				echo "- gapps source missing, restoring"
				if ! sh build.sh restore litegapps "$V" "$A" "$S"; then
					echo "! restore failed <$V $A $S>"
					FAILED=$((FAILED + 1)); FAILED_LIST="$FAILED_LIST $V/$A/$S(restore)"
					continue
				fi
			else
				echo "! gapps source missing and restore is off - skipping"
				FAILED=$((FAILED + 1)); FAILED_LIST="$FAILED_LIST $V/$A/$S(no-source)"
				continue
			fi
		fi

		T0=$(date +%s)
		if bash build.sh make litegapps "$V" "$A" "$S"; then
			echo "- build ok <$V $A $S> ($(took "$T0"))"
			OK=$((OK + 1))
		else
			echo "! build failed <$V $A $S> ($(took "$T0"))"
			FAILED=$((FAILED + 1)); FAILED_LIST="$FAILED_LIST $V/$A/$S(build)"
		fi
	done

	if [ "$T_UPLOAD" = 1 ]; then
		T0=$(date +%s)
		release_target "$A" "$S"
		echo "- release <$A/$S> took $(took "$T0")"
	fi

	if [ "$DO_CLEAN" = 1 ]; then
		echo " "
		bash "$BASED/web/clean-sources.sh" "$A" "$S"
	fi
	IFS='
'
done
IFS="$OLD_IFS"

echo " "
echo "==================================================="
echo " Batch build done : $OK ok, $FAILED failed (of $TOTAL)"
[ -n "$FAILED_LIST" ] && echo " Failed :$FAILED_LIST"
echo " Output : $BASED/output/litegapps"
echo "==================================================="

[ "$FAILED" -eq 0 ]
