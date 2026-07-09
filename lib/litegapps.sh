#################################################
# lib/litegapps.sh
#
# LiteGapps product: restore / make / clean.
# Sourced by build.sh (which provides the shared helpers:
# getp, get_config, printlog, sedlog, printmid, del, cdir, ERROR, abort,
# BIN_TEST, make_tar, make_tar_arch, make_archive, make_zip, lgapps_unzip,
# copy_binary_flashable, get_android_version, set_time_stamp, SED,
# clean_variant_dirs, and the globals base/tmp/bin/out/PROP_*).
#
# Copyright 2020 - 2025 The LiteGapps Project
#################################################

# per-variant config reader (BASED is set by the caller loop)
read_config(){ getp "$1" "$BASED/config"; }

#################################################
# Package/addon build + module prep, for variants with modules=true
# (pixel, micro, nano, basic, user, go, core). Mirrors PIXEL()/MICRO()/etc
# in sf-build.sh and prep_modules()/core_module()/copy_whitelist() in
# vps-build.sh, but lives here so `build.sh make litegapps <variant>` is
# self-contained - no external script needed to stage modules first.
#################################################

# Apps already shipped in every variant's base gapps - skip when copying
# "core" addon packages so they aren't duplicated as modules.
_litegapps_core_module(){
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

# Per-variant whitelist of extra gapps apps (verbatim from sf-build.sh)
_litegapps_module_whitelist(){
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

_litegapps_copy_whitelist(){
	local variant="$1" src="$2" dst="$3"
	local list M M1 ok
	list="$(_litegapps_module_whitelist "$variant")"
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

# Build (or reuse) packages/output/$P_ARCH/$P_SDK via the packages/ tool.
# $P_ARCH/$P_SDK must be the actual gapps version being built for this
# variant (i.e. the W_ARCH/W_SDK of the current build loop iteration) so
# the addon apks match what's really on the system partition.
_litegapps_build_addon(){
	local P_ARCH="$1" P_SDK="$2"
	local PKG="$base/packages"
	if [ -d "$PKG/output/$P_ARCH/$P_SDK" ]; then
		printlog "- Package addon <$P_ARCH/$P_SDK> already built, reusing"
		return 0
	fi
	printlog "- Building package addon <$P_ARCH/$P_SDK>"
	# packages/make reads arch/sdk from its own config for restore, not
	# from CLI args - point it at this target, then restore the file.
	cp -pf "$PKG/config" "$PKG/config.bak"
	sed -i "s/^arch=.*/arch=$P_ARCH/" "$PKG/config"
	sed -i "s/^sdk=.*/sdk=$P_SDK/" "$PKG/config"
	if [ ! -d "$PKG/files/$P_ARCH/$P_SDK" ]; then
		bash "$PKG/make" restore "$P_ARCH" "$P_SDK"
	fi
	# packages/make needs its own zipsigner.jar; it ships in the same
	# bin.zip build.sh already restored to $base/bin.
	if [ ! -f "$PKG/bin/zipsigner.jar" ] && [ -f "$base/bin/zipsigner.jar" ]; then
		mkdir -p "$PKG/bin"
		cp -pf "$base/bin/zipsigner.jar" "$PKG/bin/"
	fi
	bash "$PKG/make" make "$P_ARCH" "$P_SDK"
	mv -f "$PKG/config.bak" "$PKG/config"
}

# Stage the built addon into core/litegapps/$variant/modules/$P_ARCH/$P_SDK
_litegapps_prep_modules(){
	local variant="$1" P_ARCH="$2" P_SDK="$3"
	local psrc="$base/packages/output/$P_ARCH/$P_SDK"
	local mout="$base/core/litegapps/$variant/modules/$P_ARCH/$P_SDK"
	rm -rf "$mout"
	case "$variant" in
	core)
		_litegapps_core_module "$psrc/core" "$mout/core" ;;
	pixel)
		_litegapps_core_module "$psrc/core" "$mout/core"
		[ -d "$psrc/gapps" ] && cp -rdf "$psrc/gapps" "$mout/" ;;
	micro | nano | basic | user)
		_litegapps_core_module "$psrc/core" "$mout/core"
		_litegapps_copy_whitelist "$variant" "$psrc/gapps" "$mout/gapps" ;;
	go)
		_litegapps_core_module "$psrc/core" "$mout/core"
		_litegapps_copy_whitelist "$variant" "$psrc/go" "$mout/go" ;;
	esac
}

#################################################
# Build one flashable zip (uses W_ARCH / W_SDK / VARIANT / NAME from caller)
#################################################
make_flashable_litegapps(){
		printlog "- Build flashable"
		tmp77=$tmp
		cdir $tmp77
		copy_binary_flashable $BIN_ARCH $tmp77/bin/$BIN_ARCH
			# copy installer payload (kopi installer)
			for W in 27-litegapps.sh litegapps-post-fs litegapps; do
				if [ -f $utils/$W ]; then
					cp -pf $utils/$W $tmp77/bin/
				else
					ERROR "utils <$utils/$W> not found"
				fi
			done
			# LICENSE
			if [ -f $utils/LICENSE ]; then
				cp -pf $utils/LICENSE $tmp77/
			else
				ERROR "LICENSE <$utils/LICENSE> not found"
			fi
			# copy variant installer files
			for W in README.md; do
				if [ -f $BASED/utils/$W ]; then
				cp $BASED/utils/$W $tmp77/
				else
				ERROR "magisk files <$BASED/utils/$W> not found"
				fi
			done
			cp -af $utils/kopi/* $tmp77/
			#kopi mode install kopi (recovery)
			SED "$(getp typeinstall $tmp77/module.prop)" "auto" $tmp77/module.prop
			cp -af $utils/kopi/* $tmp77/
		# action.sh
			if [ -f $utils/action.sh ]; then
				cp -pf $utils/action.sh $tmp77/
			else
				ERROR "action.sh <$utils/action.sh> not found"
			fi
		# Customize.sh
			if [ -f $utils/customize.sh ]; then
				cp -pf $utils/customize.sh $tmp77/
			else
				ERROR "Customize.sh <$utils/customize.sh> not found"
			fi
		# copy file.tar.(type archive) in tmp
		cdir $tmp77/files
		if [ $(get_config litegapps.tar) = "multi" ] && [ -f $tmpfiles/files.tar.$(get_config compression) ]; then
		cp -pf $tmpfiles/files.tar.$(get_config compression) $tmp77/files/
		else
		cp -pf $tmp/files.tar.$(get_config compression) $tmp77/files/
		rm -rf $tmp/files.tar.$(get_config compression)
		fi
		# add modules files
		if [ $(read_config modules) = true ]; then
			test ! -d $tmp77/modules && cdir $tmp77/modules
			if [ -d $BASED/modules/$W_ARCH/$W_SDK ]; then
				cp -af $BASED/modules/$W_ARCH/$W_SDK/* $tmp77/modules/
			else
				printlog "[ERROR] <$BASED/modules/$W_ARCH/$W_SDK> not found"
				sleep 3s
				return 1
			fi
		else
			print "# Modules is disable"
		fi

		local MODULE_PROP=$tmp77/module.prop
		local MODULE_DESC=`read_config desc`
		local MODULE_UPDATE=https://raw.githubusercontent.com/litegapps/updater/main/core/litegapps/$VARIANT/${W_ARCH}/${W_SDK}/update.json
		SED "$(getp litegapps_type $MODULE_PROP)" "litegapps_regular" $MODULE_PROP
		if [ $VARIANT = lite ]; then
		SED "$(getp name $MODULE_PROP)" "$NAME $W_ARCH $(get_android_version $W_SDK) $PROP_STATUS" $MODULE_PROP
		else
		SED "$(getp name $MODULE_PROP)" "$NAME $VARIANT $W_ARCH $(get_android_version $W_SDK) $PROP_STATUS" $MODULE_PROP
		fi
		SED "$(getp id $MODULE_PROP)" "litegapps" $MODULE_PROP
		SED "$(getp author $MODULE_PROP)" "$PROP_BUILDER" $MODULE_PROP
		SED "$(getp version $MODULE_PROP)" "v${PROP_VERSION}" $MODULE_PROP
		SED "$(getp versionCode $MODULE_PROP)" "$PROP_VERSIONCODE" $MODULE_PROP
		SED "$(getp date $MODULE_PROP)" "$(date +%d-%m-%Y)" $MODULE_PROP
		SED "$(getp description $MODULE_PROP)" "$MODULE_DESC" $MODULE_PROP
		SED "$(getp litegapps_variant $MODULE_PROP)" "$VARIANT" $MODULE_PROP
		sed -i 's,'"$(getp updateJson $MODULE_PROP)"','"${MODULE_UPDATE}"',g' $MODULE_PROP

		if [ "$VARIANT" = "lite" ]; then
		local NAME_ZIP="LiteGapps-${W_ARCH}-$(get_android_version $W_SDK)-$(date +%Y%m%d)-${PROP_STATUS}.zip"
		else
		local NAME_ZIP="LiteGapps-$VARIANT-${W_ARCH}-$(get_android_version $W_SDK)-$(date +%Y%m%d)-${PROP_STATUS}.zip"
		fi
		local OUT_ZIP=$out/litegapps/$W_ARCH/$W_SDK/$VARIANT/$(date +%Y-%m-%d)/$NAME_ZIP
		make_zip $tmp $OUT_ZIP
	}

#################################################
# Build every arch x sdk for the current $VARIANT / $BASED
#################################################
_litegapps_build_variant(){
	if [ "$ARCH_IN" ]; then
	CONFIG_ARCH=$ARCH_IN
	else
	CONFIG_ARCH=`read_config arch | sed "s/,/ /g"`
	fi
	if [ "$SDK_IN" ]; then
	CONFIG_SDK=$SDK_IN
	else
	CONFIG_SDK=`read_config sdk | sed "s/,/ /g"`
	fi

	if [ "$PRODUCT" ]; then
	NAME=$PRODUCT
	else
	NAME=`read_config name`
	fi

	for W_ARCH in $CONFIG_ARCH; do
		# binary copy architecture type
		BIN_ARCH=$W_ARCH
		for W_SDK in $CONFIG_SDK; do
			sedlog "Building $NAME"
			printmid "Building $NAME"
			printlog " "
			printlog "Version : $PROP_VERSION (${PROP_VERSIONCODE})"
			printlog "Builder : $PROP_BUILDER"
			printlog "Status  : $PROP_STATUS"
			printlog "Variant : $VARIANT"
			printlog "Compressions : $PROP_COMPRESSION"
			printlog "Compressions Level : $PROP_COMPRESSION_LEVEL"
			printlog "Architecture : $W_ARCH"
			printlog "SDK : $W_SDK"
			printlog "Android Target : $(get_android_version $W_SDK)"
			printlog " "
			[ -d $tmp ] && del $tmp && cdir $tmp || cdir $tmp
			# copying gapps
			tmpfiles=$base/tmp_files/litegapps/$W_ARCH/$W_SDK

			if [ $(get_config litegapps.tar) = "multi" ] && [ -f $tmpfiles/files.tar.$(get_config compression) ]; then
			printlog "- Skipping copying gapps files"
			elif [ -d $BASED/gapps/$W_ARCH/$W_SDK ]; then
				test ! -d $tmp/$W_ARCH/$W_SDK && cdir $tmp/$W_ARCH/$W_SDK
				cp -af $BASED/gapps/$W_ARCH/$W_SDK/* $tmp/$W_ARCH/$W_SDK/
			else
				printlog "[ERROR] <$BASED/gapps/$W_ARCH/$W_SDK> not found"
				sleep 3s
				continue
			fi

			# This function is used to create a single .tar file and is used for many variants. This speeds up the build process for many variants of pixel, micro, core, and lite.
			if [ $(get_config litegapps.tar) = "multi" ] && [ ! -f $tmpfiles/files.tar.$(get_config compression) ]; then
			printlog "- make archive files.tar <multi config is active>"
			make_tar_arch
			make_archive
			cdir $tmpfiles
			cp -pf $tmp/files.tar.$(get_config compression) $tmpfiles/
			elif [ $(get_config litegapps.tar) = "multi" ] && [ -f $tmpfiles/files.tar.$(get_config compression) ]; then
			printlog "- Skipping make archive files.tar <multi config is active>"
			else
			make_tar_arch
			make_archive
			fi
			if [ "$(read_config modules)" = true ]; then
				_litegapps_build_addon "$W_ARCH" "$W_SDK"
				_litegapps_prep_modules "$VARIANT" "$W_ARCH" "$W_SDK"
			fi
			make_flashable_litegapps
		done
	done
}

#################################################
# restore / make / clean entrypoints
#################################################
litegapps_variants(){
	local d
	for d in "$base"/core/litegapps/*/; do
		[ -f "${d}config" ] && basename "$d"
	done
}

litegapps_restore(){
	local i
	for i in $(get_config litegapps.restore | sed "s/,/ /g"); do
		BASED="$base/core/litegapps/$i"
		if [ -d "$BASED" ]; then
			_litegapps_restore_variant
		else
			printlog "! [SKIP] litegapps variant <$i> not found"
		fi
	done
}

litegapps_make(){
	local LIST i
	if [ "$VARIANT" ]; then
	LIST=$VARIANT
	else
	LIST=`get_config litegapps.type | sed "s/,/ /g"`
	fi
	for i in $LIST; do
		export VARIANT=$i
		BASED="$base/core/litegapps/$i"
		if [ ! -d "$BASED" ]; then
			ERROR "[ERROR] litegapps variant <$i> not found <$BASED>"
		fi
		_litegapps_build_variant
	done
}

litegapps_clean(){
	local v
	for v in $(litegapps_variants); do
		clean_variant_dirs "$base/core/litegapps/$v"
	done
}

#################################################
# restore body (moved from core/litegapps/restore.sh)
#################################################
_litegapps_restore_variant(){
GAPPS_FILES=$BASED/files
GAPPS=$BASED/gapps
MODULES=$BASED/modules
MODULES_FILES=$BASED/modules_files
for i in $GAPPS $GAPPS_FILES $MODULES $MODULES_FILES; do
[ ! -d $i ] && cdir $i
done
LIST_ARCH=`read_config restore.arch | sed "s/,/ /g"`
LIST_SDK=`read_config restore.sdk | sed "s/,/ /g"`
NAME=`read_config name`

printlog " "
printlog "        Restore $NAME"
printlog " "


GSUFFIX=$(read_config restore.suffix)       # per-variant gapps zip suffix (e.g. -lite) -> <sdk><suffix>.zip
GFILENAME=$(read_config restore.filename)   # per-variant fixed gapps zip name (e.g. superlite) -> <name>.zip, no sdk prefix
SERVER_GAPPS=https://sourceforge.net/projects/litegapps/files/files-server/litegapps
NUM_6070=0
for D_ARCH in $LIST_ARCH; do
	for D_SDK in $LIST_SDK; do
		if [ -n "$GFILENAME" ]; then
			GZIP="$GFILENAME"
		else
			GZIP="${D_SDK}${GSUFFIX}"
		fi
		NUM_6070=$((NUM_6070 + 1))
		del "$GAPPS/$D_ARCH/$D_SDK"; cdir "$GAPPS/$D_ARCH/$D_SDK"
		cdir "$GAPPS_FILES/$D_ARCH/$D_SDK"
		ZIP="$GAPPS_FILES/$D_ARCH/$D_SDK/$GZIP.zip"
		if [ -f "$ZIP" ]; then
			printlog "${NUM_6070}. Available •> <$ZIP>"
		else
			printlog "${NUM_6070}. Downloading : $D_ARCH/$D_SDK/$GZIP.zip"
			curl --progress-bar -L -o "$ZIP" "$(sf_url "$SERVER_GAPPS/$D_ARCH/$D_SDK/$GZIP.zip/download")"
			# fallback to plain <sdk>.zip if the suffixed/named zip isn't on the server
			if [ "$GZIP" != "$D_SDK" ] && ! unzip -tq "$ZIP" >/dev/null 2>&1; then
				printlog "     <$GZIP.zip> unavailable, falling back to ${D_SDK}.zip"
				GZIP="${D_SDK}"; ZIP="$GAPPS_FILES/$D_ARCH/$D_SDK/$GZIP.zip"
				[ -f "$ZIP" ] || curl --progress-bar -L -o "$ZIP" "$(sf_url "$SERVER_GAPPS/$D_ARCH/$D_SDK/$GZIP.zip/download")"
			fi
			printlog "     File size : $(du -sh "$ZIP" 2>/dev/null | cut -f1)"
		fi
		printlog "     Extracting : $D_ARCH/$D_SDK/$GZIP.zip"
		if unzip -o "$ZIP" -d "$GAPPS/$D_ARCH/$D_SDK" >/dev/null 2>&1; then
			printlog "     Extract status : Successful"
		else
			printlog "     Extract status : Failed !!"
			printlog "     REMOVING FILES"
			del "$ZIP" "$GAPPS/$D_ARCH/$D_SDK"
			exit 1
		fi
		printlog " "
	done
done


NUM_6070=0
for D_ARCH in $LIST_ARCH; do
	for D_SDK in $LIST_SDK; do
		[ ! -d $BASED/$D_ARCH/$D_SDK ] && break
		for L_RESTORE in $(ls -1 $BASED/$D_ARCH/$D_SDK); do
			if [ -f $BASED/$D_ARCH/$D_SDK/$L_RESTORE ]; then
			F_RESTORE=$BASED/$D_ARCH/$D_SDK/$L_RESTORE
				for L_MODULES in $(cat $F_RESTORE); do
					if [ -f $MODULES/$D_ARCH/$D_SDK/$L_RESTORE/$L_MODULES.zip ]; then
						
						test ! -d $MODULES/$D_ARCH/$D_SDK/$L_RESTORE && cdir $MODULES/$D_ARCH/$D_SDK/$L_RESTORE
						test -f $MODULES/$D_ARCH/$D_SDK/$L_RESTORE/$L_MODULES.zip && del $MODULES/$D_ARCH/$D_SDK/$L_RESTORE/$L_MODULES.zip
						NUM_6070=$((NUM_6070 +1 ))
						printlog "${NUM_6070}. Available •> <$MODULES_FILES/$D_ARCH/$D_SDK/$L_RESTORE/$L_MODULES.zip>"
						printlog "     Moving : $D_ARCH/$D_SDK/$L_RESTORE/$L_MODULES.zip"
						cp -pf $MODULES_FILES/$D_ARCH/$D_SDK/$L_RESTORE/$L_MODULES.zip $MODULES/$D_ARCH/$D_SDK/$L_RESTORE
						printlog " "
					else
						NUM_6070=$((NUM_6070 +1 ))
						printlog "${NUM_6070}. Downloading : $D_ARCH/$D_SDK/$L_RESTORE/$L_MODULES.zip"
						test ! -d $MODULES/$D_ARCH/$D_SDK/$L_RESTORE && cdir $D_ARCH/$D_SDK/$L_RESTORE
						test ! -d $MODULES_FILES/$D_ARCH/$D_SDK/$L_RESTORE && cdir $MODULES_FILES/$D_ARCH/$D_SDK/$L_RESTORE
						test -f $MODULES_FILES/$D_ARCH/$D_SDK/$L_RESTORE/$L_MODULES.zip && del $MODULES_FILES/$D_ARCH/$D_SDK/$L_RESTORE/$L_MODULES.zip
       		 		#download
       		 		SERVER=https://sourceforge.net/projects/litegapps/files/addon/
       		 		curl --progress-bar -L -o $MODULES_FILES/$D_ARCH/$D_SDK/$L_RESTORE/$L_MODULES.zip "$(sf_url $SERVER/$D_ARCH/$D_SDK/$L_RESTORE/$D_SDK.zip)"
       		 		if [  $? -eq 0 ]; then
       		 			printlog "     Downloading status : Successful"
       		 			printlog "     File size : $(du -sh $MODULES_FILES/$D_ARCH/$D_SDK/$L_RESTORE/$L_MODULES.zip | cut -f1)"
       	     		else
       	     			printlog "     Downloading status : Failed"
       	     			printlog "     ! PLEASE CEK YOUR INTERNET CONNECTION AND RESTORE AGAIN"
       	     			del $MODULES_FILES/$D_ARCH/$D_SDK/$L_RESTORE/$L_MODULES.zip
       	     			exit 1
       		 		fi
       		 		printlog "     Moving : $D_ARCH/$D_SDK/$L_RESTORE/$L_MODULES.zip"
       		 		cp -pf $MODULES_FILES/$D_ARCH/$D_SDK/$L_RESTORE/$L_MODULES.zip $MODULES/$D_ARCH/$D_SDK/$L_RESTORE
			 		fi
				done
			fi
		done
	done
done

}
