#!/usr/bin/bash
#################################################
# vps-build.sh
#
# Unattended full LiteGapps build for a self-hosted VPS (no time limit).
#
# For every ARCH x SDK it:
#   1. downloads the package source zip from SourceForge
#   2. builds the addon packages (packages/make make)
#   3. uploads the addon to SourceForge (scp)
#   4. downloads the gapps files from SourceForge
#   5. builds every litegapps variant (lite ... pixel) reusing build.sh
#   6. uploads the litegapps zips to SourceForge (scp)
#   7. deletes the downloaded sources + build output before moving on,
#      so a low-memory VPS never holds more than one ARCH/SDK at a time.
#
# On any failure it logs the ARCH/SDK to the fail log and CONTINUES with
# the next target, so a multi-hour run is not aborted by one bad build.
#
# Config lives in .env (see .env.example). SSH keys to SourceForge must
# already be set up for the SF_USER account.
#
# Copyright 2020 - 2025 The LiteGapps Project
#################################################

BASED="$(dirname "$(readlink -f "$0")")"
cd "$BASED" || exit 1

#################################################
# Load .env  (gitignored, holds SF_USER etc.)
#################################################
# Load .env, but let variables already set in the environment win
# (so `SDK_LIST=36 vps-build.sh` and Docker env vars override the file).
if [ -f "$BASED/.env" ]; then
	while IFS='=' read -r _k _v; do
		case "$_k" in ''|\#*) continue ;; esac
		_v=${_v%\"}; _v=${_v#\"}          # strip surrounding double quotes
		eval "_cur=\${$_k+SET}"
		[ "$_cur" = SET ] || eval "export $_k=\$_v"
	done < "$BASED/.env"
	unset _k _v _cur
fi

#################################################
# Config (override any of these in .env)
#################################################
SF_USER="${SF_USER:-}"                                  # SourceForge username (required)
SF_HOST="${SF_HOST:-web.sourceforge.net}"               # scp host
SF_FRS="${SF_FRS:-/home/frs/project/litegapps}"         # remote release root
ARCH_LIST="${ARCH_LIST:-arm arm64 x86 x86_64}"          # architectures to build
SDK_LIST="${SDK_LIST:-29 30 31 32 33 34 35 36}"         # SDK/API levels to build
DL_BASE="${DL_BASE:-https://sourceforge.net/projects/litegapps/files/files-server}"
SF_MIRROR="${SF_MIRROR:-}"   # optional SourceForge mirror name, e.g. excellmedia (see .env.example)

# vps-build keeps its own consolidated multi-target log here, separate from
# build.sh's per-run log/ (which now appends across runs).
LOGDIR="$BASED/vps-build-logs"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/vps-build.log"
FAILLOG="$LOGDIR/vps-build-failed.log"

#################################################
# Helpers
#################################################
log(){ echo "[$(date '+%d/%m/%Y %H:%M:%S')] $*" | tee -a "$LOG"; }
fail(){
	echo "[$(date '+%d/%m/%Y %H:%M:%S')] FAIL <$CUR_ARCH/$CUR_SDK> $*" | tee -a "$LOG" "$FAILLOG"
}
line(){ log "------------------------------------------------------------"; }

SCP_OPTS="-q -o BatchMode=yes -o StrictHostKeyChecking=accept-new"

# Append ?use_mirror=<name> to a SourceForge .../download URL when SF_MIRROR is set.
sf_url(){
	if [ -n "$SF_MIRROR" ]; then
		echo "${1}?use_mirror=${SF_MIRROR}"
	else
		echo "$1"
	fi
}

# scp every file under $1 to remote $2, preserving the relative path.
# SourceForge FRS auto-creates parent directories on scp.
scp_tree(){
	local root="$1" remote="$2" rc=0 f
	if [ -n "$NO_UPLOAD" ]; then
		log "  [NO_UPLOAD] skip upload <$root> -> <$remote>"
		return 0
	fi
	[ -d "$root" ] || { fail "scp_tree: <$root> missing"; return 1; }
	cd "$root" || return 1
	for f in $(find . -type f | sed 's|^\./||'); do
		log "  scp $f -> $remote/$f"
		if ! scp $SCP_OPTS "$f" "$SF_USER@$SF_HOST:$remote/$f"; then
			fail "scp <$f>"
			rc=1
		fi
	done
	cd "$BASED" || return 1
	return $rc
}

#################################################
# Which variants to build for a given ARCH/SDK
# (mirrors MAKE_LITEGAPPS in sf-build.sh)
#################################################
variants_for(){
	local ARCH="$1" SDK="$2"
	case "$ARCH" in
	arm64)
		if [ "$SDK" -ge 21 ] && [ "$SDK" -le 25 ]; then
			echo "core lite"
		else
			echo "pixel micro nano basic user go core lite"
		fi
		;;
	arm | x86 | x86_64)
		echo "core lite"
		;;
	esac
}

#################################################
# App whitelist per variant (verbatim from sf-build.sh)
#################################################
variant_list(){
	case "$1" in
	micro) echo "
AndroidAuto Arcore SettingsIntelligenceGoogle DeskClockGoogle SoundPicker Chrome
Gmail Files GoogleAssistant GoogleCalculator GoogleCalendar GoogleContacts
GoogleDialer GoogleKeyboard GoogleTTS LocationHistory MarkupGoogle Messaging
PixelLauncher PixelLiveWallpaper Talkback Turbo Velvet GoogleSearch
WallpaperPicker Wellbeing" ;;
	nano) echo "
AndroidAuto Arcore DeskClockGoogle DevicePolicy DreamLiner Gmail GoogleAssistant
GoogleCalculator GoogleCalendar GoogleContacts GoogleDialer GoogleKeyboard
LocationHistory MarkupGoogle Messaging PlayGames SoundPicker WallpaperPicker
Wellbeing" ;;
	basic) echo "
AndroidAuto Arcore DevicePolicy GoogleDialer GoogleContacts LocationHistory
MarkupGoogle SoundPicker Wellbeing" ;;
	user) echo "
Chrome GoogleKeyboard PixelLauncher PixelLiveWallpaper Gmail" ;;
	go) echo "
AssistantGo GalleryGo GmailGo MapsGo NavigationGo VelvetGo" ;;
	esac
}

# Copy every core app EXCEPT the ones already shipped in the base files.tar
# (mirrors CORE_MODULE in sf-build.sh)
core_module(){
	local input="$1" output="$2"
	local keep="GoogleServicesFramework GmsCore GoogleCalendarSyncAdapter PlayStore Phonesky GoogleContactsSyncAdapter"
	[ -d "$input" ] || return 0
	local Y G skip
	for Y in $(ls -1 "$input"); do
		skip=false
		for G in $keep; do
			[ "$Y" = "$G" ] && skip=true && break
		done
		if ! $skip; then
			rm -rf "$output/$Y"
			mkdir -p "$output"
			cp -rdf "$input/$Y" "$output/"
		fi
	done
}

# Copy only the whitelisted apps for a variant
copy_whitelist(){
	local variant="$1" src="$2" dst="$3"
	local list M M1 ok
	list="$(variant_list "$variant")"
	[ -d "$src" ] || return 0
	for M in $(ls -1 "$src"); do
		ok=false
		for M1 in $list; do
			[ "$M" = "$M1" ] && ok=true && break
		done
		if $ok; then
			mkdir -p "$dst/$M"
			cp -rdf "$src/$M" "$dst/"
		fi
	done
}

#################################################
# Download stages
#################################################
dl_package(){
	local ARCH="$1" SDK="$2"
	local url="$DL_BASE/package/$ARCH/$SDK.zip/download"
	local zip="$BASED/packages/zip-server/$ARCH/$SDK.zip"
	local out="$BASED/packages/files/$ARCH/$SDK"
	rm -rf "$out"; mkdir -p "$out" "$(dirname "$zip")"
	log "Download package <$ARCH/$SDK>"
	if ! curl --progress-bar -L -o "$zip" "$(sf_url "$url")"; then
		fail "download package"
		return 1
	fi
	if ! unzip -o "$zip" -d "$out" >/dev/null 2>&1; then
		fail "extract package (not a valid zip - probably not on server)"
		return 1
	fi
}

dl_gapps(){
	local ARCH="$1" SDK="$2"; shift 2
	local variants="$*"
	local cache="$BASED/tmp_files/gapps-src/$ARCH/$SDK"
	local url="$DL_BASE/litegapps/$ARCH/$SDK/$SDK.zip/download"
	local url_lite="$DL_BASE/litegapps/$ARCH/$SDK/$SDK-lite.zip/download"
	rm -rf "$cache"; mkdir -p "$cache"
	log "Download gapps <$ARCH/$SDK>"
	if ! curl --progress-bar -L -o "$cache/$SDK.zip" "$(sf_url "$url")"; then
		fail "download gapps"
		return 1
	fi
	# optional lite-specific archive
	curl --progress-bar -Lf -o "$cache/$SDK-lite.zip" "$(sf_url "$url_lite")" 2>/dev/null || rm -f "$cache/$SDK-lite.zip"
	local v out src
	for v in $variants; do
		out="$BASED/core/litegapps/$v/gapps/$ARCH/$SDK"
		rm -rf "$out"; mkdir -p "$out"
		if [ "$v" = lite ] && [ -f "$cache/$SDK-lite.zip" ]; then
			src="$cache/$SDK-lite.zip"
		else
			src="$cache/$SDK.zip"
		fi
		if ! unzip -o "$src" -d "$out" >/dev/null 2>&1; then
			fail "extract gapps <$v>"
			return 1
		fi
	done
}

#################################################
# Build stages
#################################################
build_addon(){
	local ARCH="$1" SDK="$2"
	log "Build addon <$ARCH/$SDK>"
	if ! bash "$BASED/packages/make" make "$ARCH" "$SDK"; then
		fail "addon build"
		return 1
	fi
	local src="$BASED/packages/output/$ARCH/$SDK"
	[ -d "$src" ] || { fail "addon output missing"; return 1; }
	log "Upload addon <$ARCH/$SDK>"
	scp_tree "$src" "$SF_FRS/addon/$ARCH/$SDK"
}

prep_modules(){
	local variant="$1" ARCH="$2" SDK="$3"
	local psrc="$BASED/packages/output/$ARCH/$SDK"
	local mout="$BASED/core/litegapps/$variant/modules/$ARCH/$SDK"
	rm -rf "$mout"
	case "$variant" in
	lite)
		: ;; # modules disabled for lite
	core)
		core_module "$psrc/core" "$mout/core" ;;
	pixel)
		core_module "$psrc/core" "$mout/core"
		[ -d "$psrc/gapps" ] && cp -rdf "$psrc/gapps" "$mout/" ;;
	micro | nano | basic | user)
		core_module "$psrc/core" "$mout/core"
		copy_whitelist "$variant" "$psrc/gapps" "$mout/gapps" ;;
	go)
		core_module "$psrc/core" "$mout/core"
		copy_whitelist "$variant" "$psrc/go" "$mout/go" ;;
	esac
}

build_variant(){
	local variant="$1" ARCH="$2" SDK="$3"
	log "Build litegapps <$variant> <$ARCH/$SDK>"
	prep_modules "$variant" "$ARCH" "$SDK"
	if ! bash "$BASED/build.sh" make litegapps "$variant" "$ARCH" "$SDK"; then
		fail "litegapps build <$variant>"
		return 1
	fi
	local rin="$BASED/output/litegapps/$ARCH/$SDK/$variant"
	if [ ! -d "$rin" ]; then
		fail "litegapps output missing <$variant>"
		return 1
	fi
	log "Upload litegapps <$variant> <$ARCH/$SDK>"
	scp_tree "$rin" "$SF_FRS/litegapps/$ARCH/$SDK/$variant"
	[ -z "$KEEP_OUTPUT" ] && rm -rf "$rin"
	return 0
}

#################################################
# Free disk/memory for one ARCH/SDK
#################################################
cleanup_target(){
	local ARCH="$1" SDK="$2" v
	log "Cleanup sources/output <$ARCH/$SDK>"
	rm -rf "$BASED/packages/files/$ARCH/$SDK"
	rm -rf "$BASED/packages/zip-server/$ARCH/$SDK.zip"
	rm -rf "$BASED/tmp_files/gapps-src/$ARCH/$SDK"
	rm -rf "$BASED/tmp_files/litegapps/$ARCH/$SDK"
	if [ -z "$KEEP_OUTPUT" ]; then
		rm -rf "$BASED/packages/output/$ARCH/$SDK"
		rm -rf "$BASED/output/litegapps/$ARCH/$SDK"
	fi
	for v in lite core go micro pixel nano basic user; do
		rm -rf "$BASED/core/litegapps/$v/gapps/$ARCH/$SDK"
		rm -rf "$BASED/core/litegapps/$v/modules/$ARCH/$SDK"
	done
	rm -rf "$BASED/tmp"
}

#################################################
# Preflight
#################################################
preflight(){
	if [ -z "$SF_USER" ]; then
		echo "! SF_USER is not set. Create .env from .env.example and set SF_USER."
		exit 1
	fi
	local w
	for w in curl unzip zip tar scp bash; do
		if ! command -v "$w" >/dev/null; then
			echo "! Required executable <$w> not found in PATH"
			exit 1
		fi
	done
	# make sure host binaries (bin/<arch>) exist; restore once if missing
	if [ ! -d "$BASED/bin/arm64" ]; then
		log "bin/ not found - running 'build.sh restore' once"
		sh "$BASED/build.sh" restore || { echo "! restore failed"; exit 1; }
	fi
}

#################################################
# Main
#################################################
: > "$FAILLOG"
line
log "VPS build start"
log "User    : $SF_USER@$SF_HOST"
log "Arch    : $ARCH_LIST"
log "SDK     : $SDK_LIST"
line

preflight

for CUR_ARCH in $ARCH_LIST; do
	for CUR_SDK in $SDK_LIST; do
		line
		log "===> TARGET <$CUR_ARCH/$CUR_SDK>"
		VARIANTS="$(variants_for "$CUR_ARCH" "$CUR_SDK")"
		if [ -z "$VARIANTS" ]; then
			log "No variants configured for <$CUR_ARCH/$CUR_SDK> - skip"
			continue
		fi

		cleanup_target "$CUR_ARCH" "$CUR_SDK"

		# 1-3: package source -> addon -> upload addon
		if dl_package "$CUR_ARCH" "$CUR_SDK"; then
			build_addon "$CUR_ARCH" "$CUR_SDK" || log "! addon stage had errors <$CUR_ARCH/$CUR_SDK>"
		else
			log "! skipping addon+litegapps for <$CUR_ARCH/$CUR_SDK> (no package source)"
			cleanup_target "$CUR_ARCH" "$CUR_SDK"
			continue
		fi

		# 4: gapps source for the variants we will build
		if ! dl_gapps "$CUR_ARCH" "$CUR_SDK" $VARIANTS; then
			log "! skipping litegapps for <$CUR_ARCH/$CUR_SDK> (no gapps source)"
			cleanup_target "$CUR_ARCH" "$CUR_SDK"
			continue
		fi

		# 5-6: each variant -> build -> upload
		for V in $VARIANTS; do
			build_variant "$V" "$CUR_ARCH" "$CUR_SDK" || log "! variant <$V> had errors <$CUR_ARCH/$CUR_SDK>"
		done

		# 7: free memory before the next target
		cleanup_target "$CUR_ARCH" "$CUR_SDK"
		log "===> DONE <$CUR_ARCH/$CUR_SDK>"
	done
done

line
if [ -s "$FAILLOG" ]; then
	log "Build finished WITH failures. Review: $FAILLOG"
	log "Failed items:"
	cat "$FAILLOG" | tee -a "$LOG"
else
	log "Build finished successfully - no failures logged."
fi
line
