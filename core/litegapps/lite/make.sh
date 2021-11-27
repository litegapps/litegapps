#################################################
#litegapps functions
#################################################
BASED=$BASED
CONFIG=$BASED/config
read_config(){
	getp "$1" $CONFIG
	}
make_flashable_litegapps(){
	for WFL in MAGISK RECOVERY AUTO; do
		printlog "- Build flashable [$WFL]"
		cdir $tmp/$WFL
		copy_binary_flashable $BIN_ARCH $tmp/$WFL/bin/$BIN_ARCH
			# copy core/utils/magisk or kopi installer
			for W in 27-litegapps.sh litegapps-functions litegapps-post-fs litegapps; do
				if [ -f $base/core/utils/$W ]; then
					cp -pf $base/core/utils/$W $tmp/$WFL/bin/
				else
					ERROR "utils <$base/core/utils/$W> not found"
				fi
			done
			
			# Customize.sh
			if [ -f $base/core/utils/customize.sh ]; then
				cp -pf $base/core/utils/customize.sh $tmp/$WFL/
			else
				ERROR "Customize.sh <$base/core/utils/customize.sh> not found"
			fi
			# copy core/utils files
			for W in README.md LICENSE; do
				if [ -f $BASED/utils/$W ]; then
				cp $BASED/utils/$W $tmp/$WFL/
				else
				ERROR "magisk files <$BASED/utils/$W> not found"
				fi
			done
		case $WFL in
			MAGISK)
				cp -af $base/core/utils/magisk/* $tmp/$WFL/
			;;
			RECOVERY)
				cp -af $base/core/utils/kopi/* $tmp/$WFL/
				#kopi mode install kopi (recovery)
				sed -i 's/'"$(getp typeinstall $tmp/$WFL/module.prop)"'/'"kopi"'/g' $tmp/$WFL/module.prop
			;;
			AUTO)
				cp -af $base/core/utils/kopi/* $tmp/$WFL/
			;;
		esac
		# copy file.tar.(type archive) in tmp
		for W in $(ls -1 $tmp); do
			if [ -f $tmp/$W  ]; then
				test ! -d $tmp/$WFL/files && cdir $tmp/$WFL/files
				cp -pf $tmp/$W $tmp/$WFL/files/
			fi
		done
		# add modules files
		test ! -d $tmp/$WFL/modules && cdir $tmp/$WFL/modules
		#if [ -d $BASED/modules/$W_ARCH/$W_SDK ]; then
			#cp -af $BASED/modules/$W_ARCH/$W_SDK/* $tmp/$WFL/modules/
		#else
			#printlog "[ERROR] <$BASED/modules/$W_ARCH/$W_SDK> not found"
			#sleep 3s
			#continue
		#fi
			
			local MODULE_PROP=$tmp/$WFL/module.prop
			local MODULE_DESC="litegapps is a google apps package that supports almost all arch and android versions while maintaining lightness, saving battery and more."
			sed -i 's/'"$(getp litegapps_type $MODULE_PROP)"'/'"litegapps_regular"'/g' $MODULE_PROP
			sed -i 's/'"$(getp litegapps_apk_compress $MODULE_PROP)"'/'"${apk_compessed_type}"'/g' $MODULE_PROP
			sed -i 's/'"$(getp name $MODULE_PROP)"'/'"LiteGapps $W_ARCH $(get_android_version $W_SDK) $PROP_STATUS"'/g' $MODULE_PROP
			sed -i 's/'"$(getp author $MODULE_PROP)"'/'"$PROP_BUILDER"'/g' $MODULE_PROP
			sed -i 's/'"$(getp version $MODULE_PROP)"'/'"v${PROP_VERSION}"'/g' $MODULE_PROP
			sed -i 's/'"$(getp versionCode $MODULE_PROP)"'/'"$PROP_VERSIONCODE"'/g' $MODULE_PROP
			sed -i 's/'"$(getp date $MODULE_PROP)"'/'"$(date +%d-%m-%Y)"'/g' $MODULE_PROP
			sed -i 's/'"$(getp description $MODULE_PROP)"'/'"$MODULE_DESC"'/g' $MODULE_PROP
			
			#set time stamp
			set_time_stamp $tmp/$WFL
			
			local NAME_ZIP="[$WFL]LiteGapps_${W_ARCH}_$(get_android_version $W_SDK)_v${PROP_VERSION}_${PROP_STATUS}.zip"
			local OUT_ZIP=$out/litegapps/$W_ARCH/$W_SDK/lite/$NAME_ZIP
			make_zip $tmp/$WFL $OUT_ZIP
	done
	}

#################################################
#Core
#################################################
CONFIG_ARCH=`read_config arch | sed "s/,/ /g"`
CONFIG_SDK=`read_config sdk | sed "s/,/ /g"`

for W_ARCH in $CONFIG_ARCH; do
	#binary copy architecture type
	BIN_ARCH=$W_ARCH
	for W_SDK in $CONFIG_SDK; do
		clear
		sedlog "Building LiteGapps Lite"
		printmid "Building LiteGapps Lite"
		printlog " "
		printlog "Architecture=$W_ARCH"
		printlog "SDK=$W_SDK"
		printlog "Android Target=$(get_android_version $W_SDK)"
		printlog " "
		[ -d $tmp ] && del $tmp && cdir $tmp || cdir $tmp
		#copying gapps
		if [ -d $BASED/gapps/$W_ARCH/$W_SDK ]; then
			test ! -d $tmp/$W_ARCH/$W_SDK && cdir $tmp/$W_ARCH/$W_SDK
			cp -af $BASED/gapps/$W_ARCH/$W_SDK/* $tmp/$W_ARCH/$W_SDK/
		else
			printlog "[ERROR] <$BASED/gapps/$W_ARCH/$W_SDK> not found"
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
	done
done

