#################################################
# lib/litegappsx.sh
#
# LiteGappsX product: restore / make / clean.
# Sourced by build.sh (shared helpers + globals, see lib/litegapps.sh header).
#
# Copyright 2020 - 2025 The LiteGapps Project
#################################################

# per-variant config reader (BASED is set by the caller loop)
read_config(){ getp "$1" "$BASED/config"; }

#################################################
# Build one flashable zip for the current $BASED variant
#################################################
make_flashable_litegappsx(){
		tmp77=$tmp
		cdir $tmp77
		printlog "- Build flashable"
		for YR in arm arm64; do
			copy_binary_flashable $YR $tmp77/bin/$YR
		done
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
		local MODULE_UPDATE=https://raw.githubusercontent.com/litegapps/updater/main/core/litegappsx/$(read_config dir_name)/update.json
		SED "$(getp litegapps_type $MODULE_PROP)" "litegappsx" $MODULE_PROP
		SED "$(getp name $MODULE_PROP)" "$NAME $PROP_STATUS" $MODULE_PROP
		SED "$(getp id $MODULE_PROP)" "litegapps" $MODULE_PROP
		SED "$(getp author $MODULE_PROP)" "$PROP_BUILDER" $MODULE_PROP
		SED "$(getp version $MODULE_PROP)" "v${PROP_VERSION}" $MODULE_PROP
		SED "$(getp versionCode $MODULE_PROP)" "$PROP_VERSIONCODE" $MODULE_PROP
		SED "$(getp date $MODULE_PROP)" "$(date +%d-%m-%Y)" $MODULE_PROP
		SED "$(getp description $MODULE_PROP)" "$MODULE_DESC" $MODULE_PROP
		sed -i 's,'"$(getp updateJson $MODULE_PROP)"','"${MODULE_UPDATE}"',g' $MODULE_PROP

		#set time stamp
		set_time_stamp $tmp77

		local NAME_ZIP="$(read_config name | sed "s/ /-/g")-v${PROP_VERSION}-${PROP_STATUS}.zip"
		local OUT_ZIP=$out/litegappsx/$(read_config dir_name)/v${PROP_VERSION}/$NAME_ZIP
		make_zip $tmp77 $OUT_ZIP
	}

#################################################
# Build the current $VARIANT / $BASED
#################################################
_litegappsx_build_variant(){
	NAME=`read_config name`
	BIN_ARCH=arm
	sedlog "Building $NAME"
	printmid "Building $NAME"
	printlog " "
	printlog "Version : $PROP_VERSION (${PROP_VERSIONCODE})"
	printlog "Builder : $PROP_BUILDER"
	printlog "Status  : $PROP_STATUS"
	printlog "Compressions : $PROP_COMPRESSION"
	printlog "Compressions Level : $PROP_COMPRESSION_LEVEL"
	printlog " "
	[ -d $tmp ] && del $tmp && cdir $tmp || cdir $tmp
	#copying gapps
	if [ -d $BASED/gapps ]; then
	cp -af $BASED/gapps/* $tmp/
	else
	printlog "[ERROR] <$BASED/gapps/> not found"
	sleep 3s
	return 1
	fi
	# litegapps system compress
	if [ "$apk_compessed_type" = litegapps_compress ]; then
	lgapps_unzip
	make_tar
	fi
	make_tar_arch
	make_archive
	make_flashable_litegappsx
}

#################################################
# restore / make / clean entrypoints
#################################################
litegappsx_variants(){
	local d
	for d in "$base"/core/litegappsx/*/; do
		[ -f "${d}config" ] && basename "$d"
	done
}

litegappsx_restore(){
	local i
	for i in $(get_config litegappsx.restore | sed "s/,/ /g"); do
		BASED="$base/core/litegappsx/$i"
		if [ -d "$BASED" ]; then
			_litegappsx_restore_variant
		else
			printlog "! [SKIP] litegappsx variant <$i> not found"
		fi
	done
}

litegappsx_make(){
	local LIST i
	if [ "$VARIANT" ]; then
	LIST=$VARIANT
	else
	LIST=`get_config litegappsx.type | sed "s/,/ /g"`
	fi
	for i in $LIST; do
		export VARIANT=$i
		BASED="$base/core/litegappsx/$i"
		if [ ! -d "$BASED" ]; then
			ERROR "[ERROR] litegappsx variant <$i> not found <$BASED>"
		fi
		_litegappsx_build_variant
	done
}

litegappsx_clean(){
	local v
	for v in $(litegappsx_variants); do
		clean_variant_dirs "$base/core/litegappsx/$v"
	done
}

#################################################
# restore body (moved from core/litegappsx/*/restore.sh)
#################################################
_litegappsx_restore_variant(){
GAPPS_FILES=$BASED/files
GAPPS=$BASED/gapps
MODULES=$BASED/modules
MODULES_FILES=$BASED/modules_files
for i in $GAPPS $GAPPS_FILES $MODULES $MODULES_FILES; do
	[ ! -d $i ] && cdir $i
done
printlog " "
printlog "        Litegapps++ MicroG restore"
printlog " "
for WAHYU in sdk cross_system arch; do
	if [ -f $GAPPS_FILES/$WAHYU.zip ]; then
		printlog "1. Available : $WAHYU.zip"
		printlog "    Size zip : $(du -sh $GAPPS_FILES/$WAHYU.zip | cut -f1)"
		unzip -o $GAPPS_FILES/$WAHYU.zip -d $GAPPS >/dev/null 2>&1
		if [ $? -eq 0 ]; then
		printlog "    Extract status : Successful"
		else
		printlog "    Extract status : Failed"
		printlog "    REMOVING FILES"
		del $GAPPS_FILES/$WAHYU.zip
		exit 1
		fi
	else
		printlog "1. Downloading : $WAHYU.zip"
       curl -L -o $GAPPS_FILES/$WAHYU.zip https://gitlab.com/litegapps/litegapps-server/-/raw/main/litegapps++/microg/$WAHYU.zip >/dev/null 2>&1
       if [  $? -eq 0 ]; then
       	printlog "     Downloading status : Successful"
       	printlog "     File size : $(du -sh $GAPPS_FILES/$WAHYU.zip | cut -f1)"
       else
       	printlog "     Downloading status : Failed"
       	printlog "     ! PLEASE CEK YOUR INTERNET CONNECTION AND RESTORE AGAIN"
       	del $GAPPS_FILES/$WAHYU.zip
       	exit 1
       fi
       unzip -o $GAPPS_FILES/$WAHYU.zip -d $GAPPS >/dev/null 2>&1
       if [ $? -eq 0 ]; then
       	printlog "     Unzip : $GAPPS_FILES/$WAHYU.zip"
       	printlog "     unzip status : Successful"
       else
       	printlog "     Unzip : $GAPPS_FILES/$WAHYU.zip"
       	printlog "     unzip status : Failed"
       	printlog "     REMOVING FILES"
       	del $GAPPS_FILES/$WAHYU.zip
       	exit 1
       fi
	fi
done
}
