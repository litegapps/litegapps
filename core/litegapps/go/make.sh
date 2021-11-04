#################################################
#litegapps functions
#################################################
BASED=$BASED
CONFIG=$BASED/config
read_config(){
	getp "$1" $CONFIG
	}
copy_binary_flashable(){
	case $(get_config compression) in
     xz)
       local flashable_bin_32=xz
     ;;
      br | brotli)
       local flashable_bin_32=brotli
     ;;
     zip)
     	local flashable_bin_32=zip
     ;;
     7z | 7za | 7zip | 7zr | p7zip)
     	local flashable_bin_32=7za
     ;;
     zstd | zst)
     	local flashable_bin_32=zstd
     ;;
     gz | gzip | gunzip)
     	local flashable_bin_32=gz
     ;;
     esac
	local input_arch=$1
	case $input_arch in
		arm | arm64)
			local ARCHINPUT=arm
			for W in zipalign tar zip $flashable_bin_32; do
				if [ -f $base/bin/$ARCHINPUT/$W ]; then
				cdir $tmp/$WFL/bin/$ARCHINPUT
				cp -pf $base/bin/$ARCHINPUT/$W $tmp/$WFL/bin/$ARCHINPUT/
				else
					ERROR "Binary <$base/bin/$ARCHINPUT/$W> not found"
				fi
			
			done
		
		;;
		x86 | x86_64)
		echo
		
		;;
	esac
}

make_flashable_litegapps(){
	for WFL in MAGISK RECOVERY AUTO; do
		printlog "- Build flashable [$WFL]"
		cdir $tmp/$WFL
		copy_binary_flashable $BIN_ARCH
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
		if [ -d $BASED/modules/$W_ARCH/$W_SDK ]; then
			cp -af $BASED/modules/$W_ARCH/$W_SDK/* $tmp/$WFL/modules/
		else
			printlog "[ERROR] <$BASED/modules/$W_ARCH/$W_SDK> not found"
			sleep 3s
			continue
		fi
			
			local MODULE_PROP=$tmp/$WFL/module.prop
			local MODULE_DESC="LiteGapps Go is a custom gapps that provides a google go package so it's lighter."
			sed -i 's/'"$(getp litegapps_type $MODULE_PROP)"'/'"litegapps_regular"'/g' $MODULE_PROP
			sed -i 's/'"$(getp litegapps_apk_compress $MODULE_PROP)"'/'"${apk_compessed_type}"'/g' $MODULE_PROP
			sed -i 's/'"$(getp name $MODULE_PROP)"'/'"LiteGapps Core $W_ARCH $(get_android_version $W_SDK) $PROP_STATUS"'/g' $MODULE_PROP
			sed -i 's/'"$(getp author $MODULE_PROP)"'/'"$PROP_BUILDER"'/g' $MODULE_PROP
			sed -i 's/'"$(getp version $MODULE_PROP)"'/'"v${PROP_VERSION}"'/g' $MODULE_PROP
			sed -i 's/'"$(getp versionCode $MODULE_PROP)"'/'"$PROP_VERSIONCODE"'/g' $MODULE_PROP
			sed -i 's/'"$(getp date $MODULE_PROP)"'/'"$(date +%d-%m-%Y)"'/g' $MODULE_PROP
			sed -i 's/'"$(getp description $MODULE_PROP)"'/'"$MODULE_DESC"'/g' $MODULE_PROP
			
			#set time stamp
			set_time_stamp $tmp/$WFL
			
			local NAME_ZIP="[$WFL]LiteGapps_Go_${W_ARCH}_$(get_android_version $W_SDK)_v${PROP_VERSION}_${PROP_STATUS}.zip"
			local OUT_ZIP=$out/litegapps/$W_ARCH/$W_SDK/go
			printlog "- Build ZIP"
			cd $tmp/$WFL
			test ! -d $OUT_ZIP && cdir $OUT_ZIP
			test -f $OUT_ZIP/$NAME_ZIP && del $OUT_ZIP/$NAME_ZIP
			$bin/zip -r${PROP_ZIP_LEVEL} $OUT_ZIP/$NAME_ZIP . >/dev/null
			printlog " Name   : $NAME_ZIP"
			printlog " Level  : $PROP_ZIP_LEVEL"
			printlog " Size   : $(du -sh $OUT_ZIP/$NAME_ZIP | cut -f1)"
			printlog " Sha256 : $($bin/busybox sha256sum $OUT_ZIP/$NAME_ZIP | cut -d' ' -f1)"
			printlog "- Done "
			printlog " "
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
		sedlog "Building LiteGapps Core"
		printmid "Building LiteGapps Core"
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

