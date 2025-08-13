#################################################
#litegapps functions
#################################################
BASED=$BASED
CONFIG=$BASED/config
read_config(){
	getp "$1" $CONFIG
	}
make_flashable_litegapps(){
		tmp77=$tmp
		cdir $tmp77
		printlog "- Build flashable"
		for YR in arm arm64; do
			copy_binary_flashable $YR $tmp77/bin/$YR
		done
			# copy core/utils/magisk or kopi installer
			for W in 27-litegapps.sh litegapps-post-fs litegapps; do
				if [ -f $base/core/utils/$W ]; then
					cp -pf $base/core/utils/$W $tmp77/bin/
				else
					ERROR "utils <$base/core/utils/$W> not found"
				fi
			done
			# LICENSE
			if [ -f $base/core/utils/LICENSE ]; then
				cp -pf $base/core/utils/LICENSE $tmp77/
			else
				ERROR "LICENSE <$base/core/utils/LICENSE> not found"
			fi
			
			cp -af $base/core/utils/kopi/* $tmp77/
			
		# action.sh
			if [ -f $base/core/utils/action.sh ]; then
				cp -pf $base/core/utils/action.sh $tmp77/
			else
				ERROR "action.sh <$base/core/utils/action.sh> not found"
			fi
		# Customize.sh
			if [ -f $base/core/utils/customize.sh ]; then
				cp -pf $base/core/utils/customize.sh $tmp77/
			else
				ERROR "Customize.sh <$base/core/utils/customize.sh> not found"
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
				continue
			fi
		else
			print "# Modules is disable"
		fi
			
		local MODULE_PROP=$tmp77/module.prop
		local MODULE_DESC=`read_config desc`
		local MODULE_UPDATE=https://raw.githubusercontent.com/litegapps/updater/main/core/litegapps++/$(read_config dir_name)/update.json
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
#Core
#################################################
NAME=`read_config name`
#binary copy architecture type
	
BIN_ARCH=arm
clear
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
if [ -d $BASED/gapps/$W_ARCH/$W_SDK ]; then
cp -af $BASED/gapps/* $tmp/
else
printlog "[ERROR] <$BASED/gapps/> not found"
sleep 3s
continue
fi
# litegapps system compress
if [ "$apk_compessed_type" = litegapps_compress ]; then
lgapps_unzip
make_tar
fi
make_tar_arch
make_archive
make_flashable_litegapps
