#
# customize.sh 
#

# Copyright 2020 - 2025 The Litegapps Project
# Litegapps Functions
# By wahyu6070
#
print(){ ui_print "$1"; }
del (){ rm -rf "$@"; }
cdir (){ mkdir -p "$@"; }
printlog(){
	print "$1"
	if [ "$1" != " " ]; then
		echo "$1 [$(date '+%d/%m/%Y %H:%M:%S')]" >> $log
	else
		print "$1" >> $log
	fi
	}
sedlog(){
	echo "[Processing]  $1 [$(date '+%d/%m/%Y %H:%M:%S')]" >> $log
	}
	
while_log(){
	echo "$1" | tee -a $log
	}
listlog(){
	echo " " >> $log
	echo "---------- Folder List : $1 ----------" >> $log
	for w in $(find "$1" -type f); do
		echo "| $(du -sah $w | cut -f 1) | $w" >> $log
	done
	echo "--------------------------------------" >> $log
	echo " " >> $log
	}

getp(){ grep "^$1" "$2" | head -n1 | cut -d = -f 2; }

abort(){
	print " " | tee -a $log
	print "!!! $1" | tee -a $log
	print " " | tee -a $log
	exit 1
	}
	
find_slot() {
  local slot=$(getprop ro.boot.slot_suffix 2>/dev/null);
  [ "$slot" ] || slot=$( grep -o 'androidboot.slot_suffix=.*$' /proc/cmdline |  cut -d\  -f1 |  cut -d= -f2);
  if [ ! "$slot" ]; then
    slot=$(getprop ro.boot.slot 2>/dev/null);
    [ "$slot" ] || slot=$( grep -o 'androidboot.slot=.*$' /proc/cmdline |  cut -d\  -f1 |  cut -d= -f2);
    [ "$slot" ] && slot=_$slot;
  fi;
  [ "$slot" ] && echo "$slot";
}

make_log(){
	#creating log
	if [ $(getp litegapps_type $MODPATH/module.prop) = litegappsx ]; then
		NAME_LOG=`echo "[LOG]litegappsx_$(getp version $MODPATH/module.prop).zip"`
	else
		NAME_LOG=`echo "[LOG]litegapps_$(getp version $MODPATH/module.prop).zip"`
	fi
	
	
	printlog "- Make log to <$LITEGAPPS/$NAME_LOG>"
	
	
	getprop > $LITEGAPPS/log/get_prop
	
	for BLOG in $SYSTEM $PRODUCT $SYSTEM_EXT $VENDOR; do
		local BASENAME=`basename $BLOG`
		if [ -f $BLOG/build.prop ]; then
			cp -pf $BLOG/build.prop $LITEGAPPS/log/${BASENAME}_build.prop
		else
			echo "! /${BASENAME} is not detected <$BLOG/build.prop>" >> $LITEGAPPS/log/${BASENAME}_build.prop
		fi
	done
	
	if [ -d $LITEGAPPS/log ]; then
		for TR in $TMPDIR $MODPATH $LITEGAPPS; do
			test -d $TR && listlog $TR
		done
		cd $LITEGAPPS/log
		test -f $LITEGAPPS/$NAME_LOG && del $LITEGAPPS/$NAME_LOG
		$bin/zip -r9 $LITEGAPPS/$NAME_LOG * >/dev/null 2>&1
		cd /
		del $LITEGAPPS/log
	fi
}
report_bug(){
	printlog " "
	printlog "___________________________"
	printlog "| installation failed !!! |"
	printlog "|_________________________|"
	printlog " known error •> $1"
	printlog "___________________________"
	make_log
	printlog " Please report bug !"
	printlog " send log : /sdcard/Android/litegapps/$NAME_LOG"
	printlog " send in group telegram https://t.me/litegappsgroup"
	printlog "____________________________"
	printlog " "
	del $MODPATH
	[ $TYPEINSTALL = "kopi" ] && del $KOPIMOD
	
	if ! $BOOTMODE; then
		#umount
		print "- Umounting partitions";
		restore_env
	fi
	exit 1
}

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

printlog "____________________________________"
printlog "|"
case $1 in
install)
printlog "| Mode            : Install"
;;
uninstall)
printlog "| Mode            : Uninstall"
;;
*)
printlog "| Mode            : Not Detected"
;;
esac
printlog "| Name            : $MODULENAME"
printlog "| Version         : $MODULEVERSION"
printlog "| Build date      : $MODULEDATE"
printlog "| By              : $MODULEAUTHOR"
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
printlog "|___________________________________"
printlog "|"
printlog "| Website         : https://litegapps.github.io"
printlog "| Telegram        : https://t.me/litegapps"
printlog "|___________________________________"
printlog "|              Device Info"
printlog "| Name Rom        : $(GET_PROP ro.build.display.id)"
if [ "$(GET_PROP ro.product.vendor.model)" ]; then
printlog "| Device          : $(GET_PROP ro.product.vendor.model)"
elif [ "$(GET_PROP ro.product.model)" ]; then
printlog "| Device          : $(GET_PROP ro.product.model)"
else
printlog "| Device          : null"
fi

if [ "$(GET_PROP ro.product.vendor.device)" ]; then
printlog "| Codename        : $(GET_PROP ro.product.vendor.device)"
elif [ "$(GET_PROP ro.product.device)" ]; then
printlog "| Codename        : $(GET_PROP ro.product.device)"
else
printlog "| Codename        : null"
fi
printlog "| Android Version : $(GET_PROP ro.build.version.release) ($(get_android_codename $(GET_PROP ro.build.version.sdk)))"
printlog "| Architecture    : $ARCH"
printlog "| Api             : $(GET_PROP ro.build.version.sdk)"
printlog "| Density         : $(GET_PROP ro.sf.lcd_density)"
if [ $(getprop ro.build.ab_update) = "true" ]; then
	printlog "| Seamless        : A/B (slot $(find_slot))"
else
	printlog "| Seamless        : A only"
fi
sedlog "| BootMode        : $BOOTMODE"
sedlog "| System          : $SYSTEM"
printlog "|___________________________________"
sedlog "|          Developer Mode"
sedlog "| Boot Mode    : $BOOTMODE"
sedlog "| System       : $SYSTEM"
if [ -f /dev/block/by-name/super ]; then
	dynamic3=true
else
	dynamic3=false
fi
sedlog "| Dynamic Partition : $dynamic3"
sedlog "| Litegapps Type : $(getp litegapps_type $MODPATH/module.prop)"
sedlog "| Litegapps Compress : $(getp litegapps_apk_compress $MODPATH/module.prop)"
sedlog "|___________________________________"
sedlog "             Memory Info"
for W897 in /data /system /product /system_ext /vendor /dev; do
		if [ -d $W897 ]; then
		local FILESYSTEM=`df -h $W897 | tail -n 1 | tr -s ' ' | cut -d' ' -f1`
		sedlog " Partition  = $W897"
		sedlog " Filesystem = $FILESYSTEM"
		sedlog " Mounted on = $(df -h $W897 | tail -n 1 | tr -s ' ' | cut -d' ' -f6)"
		sedlog " Free       = $(df -h $W897 | tail -n 1 | tr -s ' ' | cut -d' ' -f4)"
		sedlog " Usage      = $(df -h $W897 | tail -n 1 | tr -s ' ' | cut -d' ' -f3)"
		sedlog " Total      = $(df -h $W897 | tail -n 1 | tr -s ' ' | cut -d' ' -f2)"
		sedlog " Used %     = $(df -h $W897 | tail -n 1 | tr -s ' ' | cut -d' ' -f5)"
		sedlog " Type       = $(mount | grep $FILESYSTEM | tail -n 1 | tr -s ' ' | cut -d' ' -f5)"
		sedlog "____________________________________________"
		sedlog " "
		fi
done
}

ch_con(){
chcon -h u:object_r:system_file:s0 "$1" || sedlog "Failed chcon $1"
}

ch_con_r(){
chcon -hR u:object_r:system_file:s0 "$1" || sedlog "Failed chcon $1"
}

terminal_tips(){
	print " "
	print "  Thanks for using litegapps 😁"
	print " "
	printlog "*Tips"
	print "- Open Terminal"
	print "- su"
	print "- litegapps"
	print " "
	print " "
	}

	
partition_check(){
	printlog "- Checking Partition"
	mount > $LITEGAPPS/log/mount.txt
	for R in $SYSTEM $PRODUCT $SYSTEM_EXT; do
		if [ -d $R ] && [ "$(ls -A $R)" ]; then
			touch $R/litegapps_4678
			if [ -f $R/litegapps_4678 ]; then
				sedlog "<$R> is mount RW"
				del $R/litegapps_4678
			else
				sedlog "<$R> is mount RO"
			fi
		fi
	done
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
litegappsx(){
	test ! -d $TMPDIR/$ARCH/$API && cdir $TMPDIR/$ARCH/$API
	#sdk
	if [ -d $TMPDIR/cross_sdk/$API ]; then
		cp -af $TMPDIR/cross_sdk/$API/* $TMPDIR/$ARCH/$API/
	else
		print "+ Architecture Support"
		for A1 in $(ls -1 $TMPDIR/arch); do
			printlog "         $A1"
		done
		print "+ Android Version Support"
		for A2 in $(ls -1 $TMPDIR/cross_sdk); do
			printlog "         $(get_android_version $A2)"
		done
		report_bug "Your Android Version Not Support (litegappsX)"
	fi

	#arch
	if [ -d $TMPDIR/arch/$ARCH ]; then
		if [ $API -gt 28 ]; then
			cdir  $TMPDIR/$ARCH/$API/system/product
			cp -af $TMPDIR/arch/$ARCH/system/* $TMPDIR/$ARCH/$API/system/product/
		else
			cp -af $TMPDIR/arch/$ARCH/* $TMPDIR/$ARCH/$API/
		fi
	fi
	
	#croos system
	if [ -d $TMPDIR/cross_system ]; then
		if [ $API -gt 28 ]; then
			cdir $TMPDIR/$ARCH/$API/system/product
			cp -af $TMPDIR/cross_system/system/* $TMPDIR/$ARCH/$API/system/product
		else
			cp -af $TMPDIR/cross_system/* $TMPDIR/$ARCH/$API/
		fi
	fi
	
	
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
	
	# menggunakan /tmp karena /dev/tmp di gunakan sebagai kopi installer... agar tidak penuh memori mengggunakan tmp tmdi bagi dua
	[ "$TMPDIR" ] || TMPDIR=/tmp
	if [ -d /sdcard/Android ];then
		LITEGAPPS=/sdcard/Android/litegapps
	elif [ -d /cache ]; then
		LITEGAPPS=/cache/litegapps
	else
		LITEGAPPS=/tmp/litegapps
	fi
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
	printlog "- Set Permissions"
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
	
PARTITION_MEM_CHECK(){
# cheking memory partition
# $STSTEM $PRODUCT $SYSTEM_EXT is variable in kopi installer
if [ $TYPEINSTALL = kopi ]; then
	printlog "- Checking Memory"
	if [ -d $MODPATH/system ] && [ ! -d $MODPATH/system/product ] && [ ! -d $MODPATH/system/system_ext ] && [ "$(ls -A $MODPATH/system)" ]; then
		MEM_INSTALL=`du -sk $MODPATH/system | cut -f1`
		MEM_PARTITION=`df -k $SYSTEM | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
		if [ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [ "$MEM_PARTITION" -gt "$MEM_INSTALL" ]; then
			sedlog " memory partition $SYSTEM"
			sedlog " Memory required : $(($MEM_INSTALL / 1024)) MB"
			sedlog " Available memory on partition $SYSTEM : $(($MEM_PARTITION / 1024)) MB"
			sedlog " free space is [OK]"
		elif [ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [ "$MEM_PARTITION" -le "$MEM_INSTALL" ]; then
			printlog "! memory partition $SYSTEM"
			printlog "! Memory required : $(($MEM_INSTALL / 1024)) MB"
			printlog "! Available memory on partition $SYSTEM : $(($MEM_PARTITION / 1024)) MB"
			printlog "! free space is [ERROR] full memory"
			report_bug "$SYSTEM Insufficient memory partition"
		else
			sedlog "! memory partition $SYSTEM is not detected size"
		fi
	fi
	if [ -d $MODPATH/system/product ] && [ "$(ls -A $MODPATH/system/product)" ]; then
		MEM_INSTALL=`du -sk $MODPATH/system/product | cut -f1`
		MEM_PARTITION=`df -k $PRODUCT | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
		if [ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [ "$MEM_PARTITION" -gt $"MEM_INSTALL" ]; then
			sedlog " Partition $PRODUCT"
			sedlog " Memory required : $(($MEM_INSTALL / 1024)) MB"
			sedlog " Available memory on partition $PRODUCT : $(($MEM_PARTITION / 1024)) MB"
			sedlog " free space is [OK]"
		elif [ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [ "$MEM_PARTITION" -le "$MEM_INSTALL" ]; then
			printlog "! Partition $PRODUCT"
			printlog "! Memory required : $((MEM_INSTALL / 1024 )) MB"
			printlog "! Available memory on partition $PRODUCT : $(($MEM_PARTITION / 1024)) MB"
			printlog "! free space is [ERROR] full memory"
			report_bug "$PRODUCT Insufficient memory partition"
		else
			sedlog "! memory partition $PRODUCT is not detected size"
		fi
	fi
	if [ -d $MODPATH/system/system_ext ] && [ "$(ls -A $MODPATH/system/system_ext)" ]; then
		MEM_INSTALL=`du -sk $MODPATH/system/system_ext | cut -f1`
		MEM_PARTITION=`df -k $SYSTEM_EXT | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
		if [ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [ "$MEM_PARTITION" -gt "$MEM_INSTALL" ]; then
			sedlog " Partition $SYSTEM_EXT"
			sedlog " Memory required : $(($MEM_INSTALL / 1024)) MB"
			sedlog " Available memory on partition $SYSTEM_EXT : $(($MEM_PARTITION / 1024)) MB"
			sedlog " free space is [OK]"
		elif [ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [ "$MEM_PARTITION" -le "$MEM_INSTALL" ]; then
			printlog "! Partition $(($SYSTEM_EXT / 1024)) MB"
			printlog "! Memory required : $(($MEM_INSTALL / 1024)) MB"
			printlog "! Available memory on partition $SYSTEM_EXT : $(($MEM_PARTITION / 1024)) MB"
			printlog "! free space is [ERROR] full memory"
			report_bug "$SYSTEM_EXT Insufficient memory partition"
		else
			sedlog "! memory partition $SYSTEM_EXT is not detected size"
		fi
		
	fi
else
	if $BOOTMODE && [ -d $MODPATH/system ] && [ "$(ls -A $MODPATH/system)" ]; then
		MEM_INSTALL=`du -sk $MODPATH/system | cut -f1`
		MEM_PARTITION=`df -k /data | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
		if [ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [ "$MEM_PARTITION" -gt "$MEM_INSTALL" ]; then
			sedlog " Partition /data"
			sedlog " Memory required : $(($MEM_INSTALL / 1024)) MB"
			sedlog " Available memory on partition /data : $(($MEM_PARTITION / 1024)) MB"
			sedlog " free space is [OK]"
		elif [ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [ "$MEM_PARTITION" -le "$MEM_INSTALL" ]; then
			printlog "! Partition /data"
			printlog "! Memory required : $(($MEM_INSTALL / 1024)) MB"
			printlog "! Available memory on partition /data : $((MEM_PARTITION / 1024)) MB"
			printlog "! free space is [ERROR] full memory"
			report_bug "/data partition memory is full"
		else
			sedlog "! memory partition /data is not detected size"
		fi
	fi

fi
}
PAR_CHECK_MB_TOTAL(){
	#check partisi mb
	local MEM6=`df -k "$1" | tail -n 1 | tr -s ' ' | cut -d' ' -f2`
	local MEM7=$((($MEM6 / 1024)))
	echo "$MEM7"
	}

PAR_CHECK_MB(){
	#check partisi mb
	local MEM6=`df -k "$1" | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
	local MEM7=$((($MEM6 / 1024)))
	echo "$MEM7"
	}

MEM_CHECK_TMP (){
	local T1=`PAR_CHECK_MB $MODPATH`
	local L1=`PAR_CHECK_MB_TOTAL $MODPATH`
	if [ $T1 -lt 200 ]; then
	printlog "[!] <$TMPDIR> partition under 200MB (FREE=${T1}MB TOTAL=${L1}MB)"
	else
	sedlog "[+] <${MODPATH}> Partition Free Space $T1 MB TOTAL=${L1}MB"
	fi
	
	local T2=`PAR_CHECK_MB $TMPDIR`
	local L2=`PAR_CHECK_MB_TOTAL $TMPDIR`
	if ! $BOOTMODE; then
		if [ $T2 -lt "200" ]; then
			printlog "[!] <$TMPDIR> partition under 200MB (FREE=${T2}MB TOTAL=${L2}MB)"
		else
			sedlog "[+] <${TMPDIR}> Partition Free Space $T2 MB TOTAL=${L2}MB"
		fi
	fi
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
	sedlog "- Backuping $PROP_FILE TO $DIR_BACKUP/build.prop"
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
	
MODULE_INSTALL(){
	local DIR_BACKUP=$LITEGAPPS/backup
	local packagename=`getp package.name $MODULE_TMP/litegapps-prop`
	local packageid=`getp package.id $MODULE_TMP/litegapps-prop`
	local packagesize=`getp package.size $MODULE_TMP/litegapps-prop`
	cdir $DIR_BACKUP
	
	
	 #fix bootloop jika google files di instal di rom crdroid
	#if [ "$(GET_PROP ro.crdroid.display.version)" ] && [ $packageid = Files ] && [ $API -le 30 ]; then
		#printlog "[SKIP] $packagename in crdroid ROM"
		#return 0
	#fi
	
	# skip biar gk bootlop di miui atau hyper
	if [ -f $SYSTEM/framework/boot-miui-framework.vdex ]; then
		local RT="
		CarrierServices
		SetupWizard
		PixelSetupWizard
		"
		for YR in $RT; do
		if [ $packageid = $YR ]; then
			printlog "[SKIP] $packagename In MIUI/Hyper os"
			return 0
		fi
		done
	fi
	
	# litegapps config enable dan disable
	if [ $FCONFIG ]; then
		if [ $(getp $packageid $FCONFIG) = false ]; then
			printlog "[SKIP] $packagename by config"
			return 0
		fi
	fi
	
	# fix bootloop jika partisi /data tidak di clean flash dalam mode systemless
	local list1="
	GoogleKeyboard
	DeskClockGoogle
	"
	for A8 in $list1; do
		local blacklist=false
	  if [ $A8 = $packageid ]; then
	    local blacklist=true
	    break
	  fi
	 done
	
	if [ -f /data/system/packages.xml ] && [ $blacklist = true ]; then
		printlog "-[!] Skipping $packagename -> This Package For Non Systemless only"
		return 0
	elif [ $TYPEINSTALL = systemless ] && [ $blacklist = true ]; then
		printlog "-[!] Skipping $packagename -> This Package For Non Systemless Only"
		return 0
	else
		printlog "- Installing $packagename"
	fi
	
	
	#check package 
	if [ ! "$SDK" -eq "$(getp android_sdk $MODULE_TMP/module.prop)" ]; then
		printlog "-! This package for sdk : $(getp android_sdk $MODULE_TMP/module.prop)"
		printlog "-! Your sdk version : $SDK"
		printlog " "
		printlog "-! Install package $packagename Failed !!!"
		return 1
	fi
	if [ "$ARCH" != "$(getp android_arch $MODULE_TMP/module.prop)" ]; then
		printlog "! This package for arch : $(getp android_arch $MODULE_TMP/module.prop)"
		printlog "! Your arch version : $ARCH"
		printlog " "
		printlog "! Install package $packagename Failed !!!"
		return 1
	fi

	# remove file and backup
	for Y in $SYSTEM $PRODUCT $SYSTEM_EXT; do
     for G in app priv-app; do
        for P in $(cat $MODULE_TMP/list-rm); do
           if [ -d $Y/$G/$P ]; then
             if [ $TYPEINSTALL = systemless ]; then
             	if [ $KSU ] || [ $APATCH ]; then
             	# debloat by ksu/apatch 
             		if [ $SYSTEM = $Y ]; then
             			printlog "- Debloating systemless $Y/$G/$P"
             			mkdir -p $MODPATH/system/$G/$P
             			touch mkdir -p $MODPATH/system/$G/$P/${P}.apk
                	elif [ $SYSTEM_EXT = $Y ]; then
                		printlog "- Debloating systemless $Y/$G/$P"
                		mkdir -p $MODPATH/system/system_ext/$G/$P
                		touch mkdir -p $MODPATH/system_ext/$G/$P/${P}.apk
                	elif [ $PRODUCT = $Y ]; then
                    	printlog "- Debloating systemless $Y/$G/$P"
                    	mkdir -p $MODPATH/system/product/$G/$P
                    	touch mkdir -p $MODPATH/product/$G/$P/${P}.apk
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
               #[ ! -d $MODPATH/system/etc/kopi/modules/litegapps ] && mkdir -p $MODPATH/system/etc/kopi/modules/litegapps
               [ ! -d $KOPIMOD ] && mkdir -p $KOPIMOD
               printlog "-+ Removing  $Y/$G/$P"
               echo "$P" >> $KOPIMOD/list-package-remove
               echo "$Y/$G/$P" >> $KOPIMOD/list-debloat
               del $Y/$G/$P
             fi
           fi
        done
     done
	done

	# Copying files
	sedlog "- Copying <$MODULE_TMP/system> to <$MODPATH/system>"
	cp -rdf $MODULE_TMP/system/* $MODPATH/system/
	listlog $MODPATH/system
	[ $SYSTEMLESSUP ] || SYSTEMLESSUP=$MODPATH
	
	if [ $packageid = "SetupWizard" ]; then
	#add buildprop config
	printlog "-+ Add config Setup Wizard in build.prop"
	SETUP_WIZARD
	fi
}

MODULE_UNINSTALL(){
	
	local DIR_BACKUP=$LITEGAPPS/backup

cdir $DIR_BACKUP
printlog "- Uninstalling $(getp package.name $MODULE_TMP/litegapps-prop)"
if [ -f $DIR_BACKUP/list-debloat ]; then
	for P in $(cat $DIR_BACKUP/list-debloat); do
		[ ! -d $P ] && cdir $P
		printlog "- Restoring $P"
		sedlog "- copying $DIR_BACKUP${P} T0 $DIR_i/"
		cp -rdf $DIR_BACKUP${P}/* $P/
		#set permissions
		chmod 644 $P/$(basename $P).apk
		chcon -h u:object_r:system_file:s0 $P/$(basename $P).apk
		chmod 755 $P
		chcon -h u:object_r:system_file:s0 $P
	done
fi


# restore product/build.prop
if [ -f $DIR_BACKUP/build.prop ]; then
	cp -pf $DIR_BACKUP/build.prop $SYSTEM/build.prop
fi
del $DIR_BACKUP

	
	
	}


# main path
INITIAL install

#bin
bin=$MODPATH/bin/$ARCH

chmod -R 755 $bin

MEM_CHECK_TMP

#checking format file
if [ -f $files/files.tar.xz ]; then
	format_file=xz
elif [ -f $files/files.tar.br ]; then
	format_file=brotli
else
	report_bug "File Gapps not found or format not support"
	listlog $files
fi
sedlog "Format file : $format_file"

#checking architecture executable support
test ! -f $bin/tar && report_bug "your architecture is not supported or not compatible with your device"

#checking executable
for W in $format_file tar zip; do
	test ! -f $bin/$W && report_bug "Please add executable <$W> in <$bin/$W>"
done

MEM_CHECK_TMP

#extracting file format
printlog "- Extracting Gapps"
case $format_file in
xz)
	$bin/xz -d $files/files.tar.xz || report_bug "Failed extract <files.tar.xz>"
;;
brotli)
	$bin/brotli -dj $files/files.tar.br || report_bug "Failed extract <files.tar.br>"
	;;
*)
	report_bug "File format not support"
	listlog $files ;;
esac

MEM_CHECK_TMP

#extract tar files
printlog "- Extracting Archive"
if [ -f $files/files.tar ]; then
	sedlog "Extracting $files/$ARCH.tar"
	$bin/tar -xf $files/files.tar -C $TMPDIR
	listlog $files
else
	report_bug "File <files.tar> not found !!!"
fi

MEM_CHECK_TMP


#### Diference litegappsX
if [ $(getp litegapps_type $MODPATH/module.prop) = litegappsx ]; then
	sedlog "LiteGapps Type : LiteGapps X"
	litegappsx
else
	sedlog "LiteGapps Type : LiteGapps Reguler"
fi
#### End defference litegappsX

MEM_CHECK_TMP

#checking sdk files
if [ ! -d $TMPDIR/$ARCH/$API ]; then
	print "+ Architecture Support"
	for A1 in $(ls -1 $TMPDIR); do
		printlog "         $A1"
	done
	print "+ Android Version Support"
	for A2 in $(ls -1 $TMPDIR/$ARCH); do
		printlog "         $(get_android_version $A2)"
	done
	report_bug "Your Android Version Not Support"
fi


#copying file
printlog "- Copying Gapps"
sysdirtarget=$MODPATH/system
vendirtarget=$MODPATH/system/vendor
cdir $sysdirtarget
#cdir $vendirtarget

MEM_CHECK_TMP

if [ -d $TMPDIR/$ARCH/$API/system ]; then
	sedlog "- Copying system"
	listlog $TMPDIR
	cp -af $TMPDIR/$ARCH/$API/system/* $sysdirtarget/
	del TMPDIR/$ARCH/$API/system
fi

MEM_CHECK_TMP


if [ -d $TMPDIR/$ARCH/$API/vendor ]; then
	sedlog "- Copying vendor"
	listlog $TMPDIR
	cp -af $TMPDIR/$ARCH/$API/vendor/* $vendirtarget/
	del $TMPDIR/$ARCH/$API/vendor
fi


# modules
list_config="
/sdcard
/data/media/0
/system
/vendor
/product
/system_ext
/data
/dev
"

for YY in $list_config; do
	if [ -f $YY/litegapps.config ]; then
		FCONFIG=$YY/litegapps.config
		printlog "- Config Detected : $FCONFIG"
		break
	fi
done

MEM_CHECK_TMP

SDK=$API
ARCH=$ARCH
MODULES=$MODPATH/modules
MODULE_TMP=$TMPDIR/module_tmp
listlog $MODULES
if [ -d $MODULES ] && ! rmdir $MODULES 2>/dev/null; then
	printlog "- Modules Detected"
	for LIST_MODULES in $(find $MODULES -type f); do
		if [ -f $LIST_MODULES ]; then
		sedlog "- Extracting <$LIST_MODULES>"
			del $MODULE_TMP
			cdir $MODULE_TMP
			sedlog "- Unzip <$LIST_MODULES> to <$MODULE_TMP>"
			unzip -o $LIST_MODULES -d $MODULE_TMP >&2
			listlog $MODULE_TMP
			if [ -f $MODULE_TMP/litegapps-prop ]; then
				MODULE_INSTALL
				sedlog "- Remove $LIST_MODULES"
				del $LIST_MODULES
			else
				printlog "! Failed installing module <$(basename $LIST_MODULES)> skipping"
				continue
			fi
			del $MODULE_TMP
		fi
	done
fi

MEM_CHECK_TMP

SET_PERM_PARTITION




#addon.d
if [ $TYPEINSTALL = kopi ]; then
	printlog "- Installing addon.d"
	test ! -d $SYSTEM/addon.d && mkdir -p $SYSTEM/addon.d
	cp -pf $MODPATH/bin/27-litegapps.sh $SYSTEM/addon.d/
	chmod 755 $SYSTEM/addon.d/27-litegapps.sh
fi

#litegapps menu
cdir $MODPATH/system/bin
cp -pf $MODPATH/bin/litegapps $MODPATH/system/bin/
chmod 755 $MODPATH/system/bin/litegapps
chmod 755 $MODPATH/action.sh

#Litegapps service
if [ ! -f $LITEGAPPS/disable_post_fs ] && [ $TYPEINSTALL = systemless ]; then
	printlog "- Installing litegapps post-fs"
	cp -pf $MODPATH/bin/litegapps-post-fs $MODPATH/service.sh
	chmod 755 $MODPATH/service.sh
fi

#check partition ro/rw
partition_check

ls -alZR $MODPATH/system > $LITEGAPPS/log/system_modpath
for T in $SYSTEM $PRODUCT $SYSTEM_EXT; do
	if [ -d $T ] && [ "$(ls -A $T)" ]; then
		ls -alZR $T > $LITEGAPPS/log/$(basename ${T}).old
	else
		sedlog "! <$T> not found"
	fi

done


# Checking memory partition
MEM_CHECK_TMP
PARTITION_MEM_CHECK


printlog "- Cleaning cache"
LIST_CACHE="
$files
$MODPATH/modules
"
for W in $LIST_CACHE ; do
	sedlog "- removing cache $W"
	del $W
done

if [ $TYPEINSTALL = systemless ]; then
#creating log
make_log
fi

#terminal tips
terminal_tips

if [ $TYPEINSTALL = kopi ] && [ ! -d $SYSTEM/addon.d ]; then
	printlog "! Your ROM does not support addon.d ... and you must install litegapps after reinstalling or updating the ROM."
	printlog " "
fi


