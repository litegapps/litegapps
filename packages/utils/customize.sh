
#
# Customize.sh
#


print(){ ui_print "$1"; }
del (){ rm -rf "$@"; }
cdir (){ mkdir -p "$@"; }
getp(){ grep "^$1" "$2" | head -n1 | cut -d = -f 2; }

GET_PROP(){
	local LIST_PROP="
	$SYSTEM/build.prop
	$VENDOR/build.prop
	$PRODUCT/build.prop
	$SYSTEM_EXT/build.prop
	"
	local HJ VARPROP
	for HJ in $LIST_PROP; do
		if [ -f $HJ ] && grep -q "$1" "$HJ" 2>/dev/null; then
			VARPROP=`grep "^$1" "$HJ" | head -n1 | cut -d = -f 2`
			break
		fi
	done
	
	if [ "$VARPROP" ]; then
		echo "$VARPROP"
	elif [ "$(getprop $1)" ]; then
		getprop $1
	else
		return 1
	fi
	
	}
get_android_codename(){
	local input=$1
	case $input in
		21) echo "Lollipop" ;;
		22) echo "Lollipop" ;;
		23) echo "Marshmallow" ;;
		24) echo "Nougat" ;;
		25) echo "Nougat" ;;
		26) echo "Oreo" ;;
		27) echo "Oreo" ;;
		28) echo "Pie" ;;
		29) echo "Quince Tart" ;;
		30) echo "Red Velvet Cake" ;;
		31) echo "Snow Cone" ;;
		32) echo "Snow Cone" ;;
		33) echo "Tiramisu" ;;
		34) echo "Upside Down Cake" ;;
		35) echo "Vanilla Ice Cream" ;;
		36) echo "Baklava" ;;
		*) echo "null" ;;
	 esac
	}
INFO(){
MODULEVERSION=`getp version $MODPATH/module.prop`
MODULECODE=`getp versionCode $MODPATH/module.prop`
MODULENAME=`getp name $MODPATH/module.prop`
MODULEANDROID=`getp android $MODPATH/module.prop`
MODULEDATE=`getp date $MODPATH/module.prop`
MODULEAUTHOR=`getp author $MODPATH/module.prop`

packagename=`getp package.name $MODPATH/litegapps-prop`
packagesize=`getp package.size $MODPATH/litegapps-prop`
packagedate=`getp package.date $MODPATH/litegapps-prop`
packageversion=`getp package.version $MODPATH/litegapps-prop`
packagecode=`getp package.code $MODPATH/litegapps-prop`
packageid=`getp package.id $MODPATH/litegapps-prop`


print "____________________________________"
print "|"
case $1 in
install)
print "| Mode            : Install"
;;
uninstall)
print "| Mode            : Uninstall"
;;
*)
print "| Mode            : Not Detected"
;;
esac
print "| Name            : ${packagename}"
print "| Version         : ${packageversion}"
print "| Build date      : $MODULEDATE"
print "| Size            : ${packagesize}"
if [ $TYPEINSTALL = systemless ]; then
	if [ $KSU_NEXT = true ]; then
		KSUD_MOUNT=`ksud module mount | head -n1 | cut -d : -f 2`
		printlog "| Install As      : systemless (KerneSU-Next Module $KSUD_MOUNT)"
	elif [ $KSU = true ]; then
		printlog "| Install As      : systemless (KSU Module)"
	elif [ $APATCH = true ]; then
		printlog "| Install As      : systemless (APATCH Module)"
	else
		printlog "| Install As      : systemless (Magisk Module)"
	fi
	
else
		printlog "| Install As      : non systemless"

fi
print "|___________________________________"
print "|"
print "| Website         : https://litegapps.github.io"
print "|___________________________________"
print "|              Device Info"
print "| Name Rom        : $(GET_PROP ro.build.display.id)"
if [ "$(GET_PROP ro.product.vendor.model)" ]; then
print "| Device          : $(GET_PROP ro.product.vendor.model)"
elif [ "$(GET_PROP ro.product.model)" ]; then
print "| Device          : $(GET_PROP ro.product.model)"
else
print "| Device          : null"
fi

if [ "$(GET_PROP ro.product.vendor.device)" ]; then
print "| Codename        : $(GET_PROP ro.product.vendor.device)"
elif [ "$(GET_PROP ro.product.device)" ]; then
print "| Codename        : $(GET_PROP ro.product.device)"
else
print "| Codename        : null"
fi
print "| Android Version : $(GET_PROP ro.build.version.release) ($(get_android_codename $(GET_PROP ro.build.version.sdk)))"
print "| Architecture    : $ARCH"
print "| Api             : $(GET_PROP ro.build.version.sdk)"
print "| Density         : $(GET_PROP ro.sf.lcd_density)"
if [ $(getprop ro.build.ab_update) = true ]; then
	print "| Seamless        : A/B (slot $(find_slot))"
else
	print "| Seamless        : A only"
fi

print "|___________________________________"
print " "
}

ch_con(){
chcon -h u:object_r:system_file:s0 "$1" || sedlog "Failed chcon $1"
}

ch_con_r(){
chcon -hR u:object_r:system_file:s0 "$1" || sedlog "Failed chcon $1"
}


get_android_version(){
	local input=$1
	case $input in
		21) echo 5.0 ;;
		22) echo 5.1 ;;
		23) echo 6.0 ;;
		24) echo 7.0 ;;
		25) echo 7.1 ;;
		26) echo 8.0 ;;
		27) echo 8.1 ;;
		28) echo 9.0 ;;
		29) echo 10.0 ;;
		30) echo 11.0 ;;
		31) echo 12.0 ;;
		32) echo 12.1 ;;
		33) echo 13.0 ;;
		34) echo 14.0 ;;
		35) echo 15.0 ;;
		36) echo 16.0 ;;
		*) echo null ;;
	 esac
	}

INITIAL(){
	local mode=$1
	#path
	if [ -f /system_root/system/build.prop ]; then
		SYSTEM=/system_root/system 
	elif [ -f /system_root/build.prop ]; then
		SYSTEM=/system_root
	elif [ -f /system/system/build.prop ]; then
		SYSTEM=/system/system
	else
		SYSTEM=/system
	fi

	if [ ! -L $SYSTEM/vendor ]; then
		VENDOR=$SYSTEM/vendor
	else
		VENDOR=/vendor
	fi

	# /product dir (android 10+)
	if [ ! -L $SYSTEM/product ]; then
		PRODUCT=$SYSTEM/product
	else
		PRODUCT=/product
	fi

	# /system_ext dir (android 11+)
	if [ ! -L $SYSTEM/system_ext ]; then
		SYSTEM_EXT=$SYSTEM/system_ext
	else
		SYSTEM_EXT=/system_ext
	fi
	
	
	[ "$TMPDIR" ] || TMPDIR=/dev/tmp
	LITEGAPPS=/data/media/0/Android/litegapps
	log=$LITEGAPPS/log/litegapps.log
	files=$MODPATH/files

	#detected build.prop
	[ ! -f $SYSTEM/build.prop ] && report_bug "System build.prop not found"


	[ $API ] || API=$(getp ro.build.version.sdk $SYSTEM/build.prop)
	[ $ARCH ] || ARCH=$(getp ro.product.cpu.abi $SYSTEM/build.prop | cut -d '-' -f -1)

	case $ARCH in
	arm64) ARCH=arm64 ;;
	armeabi | arm) ARCH=arm ;;
	x86) ARCH=x86 ;;
	x86_64) ARCH=x86_64 ;;
	*) report_bug " <$ARCH> Your Architecture Not Support" ;;
	esac


	#mode installation
	if [ ! "$TYPEINSTALL" ]; then
		TYPEINSTALL=systemless
	fi


	# Test /data rw partition
	case $TYPEINSTALL in
	systemless)
	DIR_TEST=/data/adb/test8989
	cdir $DIR_TEST
	touch $DIR_TEST/io
	[ -f $DIR_TEST/io ] && del $DIR_TEST || report_bug "/data partition is encrypt or read only"
	;;
	esac

	for CCACHE in $LITEGAPPS/log; do
		test -d $CCACHE && del $CCACHE && cdir $CCACHE || cdir $CCACHE
	done

	#functions litegapps info module.prop and build.prop
	INFO $mode
	print " "
		
}

SET_PERM_PARTITION (){
	#Permissions
	print "- Set Permissions"
	for setperm_dir in $(find $MODPATH/system -type d 2>/dev/null); do
		sedlog "- Set chcon dir : $setperm_dir"
		ch_con $setperm_dir
		sedlog "- Set chmod 755 dir : $setperm_dir"
		chmod 755 $setperm_dir
		chown 0:0 $setperm_dir
	done

	for setperm_file in $(find $MODPATH/system -type f 2>/dev/null); do
		sedlog "- Set chcon file : $setperm_file"
		ch_con $setperm_file
		sedlog "- Set chmod 644 file : $setperm_file"
		chmod 644 $setperm_file
		chown 0:0 $setperm_file
	done
	
	}
	

set_prop() {
  local property="$1"
  local value="$2"
  file_location="$3"
  if grep -q "${property}" "${file_location}"; then
    sed -i "s/\(${property}\)=.*/\1=${value}/g" "${file_location}"
  else
    echo "${property}=${value}" >>"${file_location}"
  fi
}
SETUP_WIZARD(){
	case $TYPEINSTALL in
	systemless)
	PROP_DIR=$MODPATH/system.prop
	touch $PROP_DIR
	set_prop "setupwizard.feature.baseline_setupwizard_enabled" "true" "$PROP_DIR"
	set_prop "ro.setupwizard.enterprise_mode" "1" "$PROP_DIR"
	set_prop "ro.setupwizard.rotation_locked" "true" "$PROP_DIR"
	set_prop "setupwizard.enable_assist_gesture_training" "true" "$PROP_DIR"
	set_prop "setupwizard.theme" "glif_v3_light" "$PROP_DIR"
	set_prop "setupwizard.feature.skip_button_use_mobile_data.carrier1839" "true" "$PROP_DIR"
	set_prop "setupwizard.feature.show_pai_screen_in_main_flow.carrier1839" "false" "$PROP_DIR"
	set_prop "setupwizard.feature.show_pixel_tos" "false" "$PROP_DIR"
	set_prop "ro.setupwizard.network_required" "false" "$PROP_DIR"
	;;
	kopi)
	PROP_FILE=$SYSTEM/build.prop
	print "-+ Backuping $PROP_FILE TO $DIR_BACKUP/build.prop"
	cp -pf $PROP_FILE $DIR_BACKUP/build.prop
	set_prop "setupwizard.feature.baseline_setupwizard_enabled" "true" "$PROP_FILE"
	set_prop "ro.setupwizard.enterprise_mode" "1" "$PROP_FILE"
	set_prop "ro.setupwizard.rotation_locked" "true" "$PROP_FILE"
	set_prop "setupwizard.enable_assist_gesture_training" "true" "$PROP_FILE"
	set_prop "setupwizard.theme" "glif_v3_light" "$SYSTEM/product/build.prop"
	set_prop "setupwizard.feature.skip_button_use_mobile_data.carrier1839" "true" "$PROP_FILE"
	set_prop "setupwizard.feature.show_pai_screen_in_main_flow.carrier1839" "false" "$PROP_FILE"
	set_prop "setupwizard.feature.show_pixel_tos" "false" "$PROP_FILE"
	set_prop "ro.setupwizard.network_required" "false" "$PROP_FILE"
	;;
	esac
	}

	


INITIAL install
print "- Installing"
#check package 
MOD_SDK=`getp android_sdk $MODPATH/module.prop`
if [ "$MOD_SDK" != all ] && [ ! "$API" -eq "$MOD_SDK" ]; then
	print " This package for sdk : $MOD_SDK"
	print " Your sdk version : $API"
	print " "
	print " Install package $packagename Failed !!!"
	exit 1
fi

MOD_ARCH=`getp android_arch $MODPATH/module.prop`
if [ "$MOD_ARCH" != all ] && [ "$ARCH" != "$MOD_ARCH" ]; then
	print " ${R}This package for arch : $MOD_ARCH"
	print " ${G}Your arch version : $ARCH"
	print " "
	print "${R} Install package $packagename Failed !!!"
	exit 1
fi

#Debloat
for Y in $SYSTEM $PRODUCT $SYSTEM_EXT; do
     for G in app priv-app; do
        for P in $(cat $MODPATH/list-rm); do
           if [ -d $Y/$G/$P ]; then
             if [ $TYPEINSTALL = systemless ]; then
             
             	if [ $KSU_NEXT = true ] || [ $KSU = true ] || [ $APATCH = true ]; then
             	# debloat by ksu/apatch 
             		if [ $SYSTEM = $Y ]; then
             			printlog "- Debloating KSU/APATCH $Y/$G/$P"
             			mkdir -p $MODPATH/system/$G
             			mknod $MODPATH/system/$G/$P c 0 0
                	elif [ $SYSTEM_EXT = $Y ]; then
                		printlog "- Debloating KSU/APATCH $Y/$G/$P"
                		mkdir -p $MODPATH/system/system_ext/$G
                		mknod $MODPATH/system/system_ext/$G/$P c 0 0
                	elif [ $PRODUCT = $Y ]; then
                    	printlog "- Debloating KSU/APATCH $Y/$G/$P"
                    	mkdir -p $MODPATH/system/product/$G
                    	mknod $MODPATH/system/product/$G/$P c 0 0
                	fi
             	
             	else
             	# debloat by magisk
             		if [ $SYSTEM = $Y ]; then
             			printlog "- Debloating systemless2 $Y/$G/$P"
             			mkdir -p $MODPATH/system/$G/$P/.replace
                	elif [ $SYSTEM_EXT = $Y ]; then
                		printlog "- Debloating systemless2 $Y/$G/$P"
                		mkdir -p $MODPATH/system/system_ext/$G/$P/.replace
                	elif [ $PRODUCT = $Y ]; then
                    	printlog "- Debloating systemless2 $Y/$G/$P"
                    	mkdir -p $MODPATH/system/product/$G/$P/.replace
                	fi
             	fi
             elif [ $TYPEINSTALL = kopi ]; then
               [ ! -d $TMP/backup${Y}/$G/$P ] && mkdir -p $TMP/backup${Y}/$G/$P
               #print "- Backuping to $TMP/backup${Y}/$G/$P"
               #cp -rdf $Y/$G/$P/* $TMP/backup${Y}/$G/$P/
               print "- Removing   $Y/$G/$P"
               echo "$Y/$G/$P" >> $TMP/list-debloat
               rm -rf $Y/$G/$P
             fi
           fi
        done
     done
done


SET_PERM_PARTITION

if [ $packageid = "SetupWizard" ]; then
SETUP_WIZARD
fi

