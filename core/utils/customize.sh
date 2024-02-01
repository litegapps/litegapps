#
# customize.sh 
#

chmod 755 $MODPATH/bin/litegapps-functions
#litegapps functions
. $MODPATH/bin/litegapps-functions
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




tmp=$MODPATH/tmp
LITEGAPPS=/data/media/0/Android/litegapps
log=$LITEGAPPS/log/litegapps.log
loglive=$LITEGAPPS/log/litegapps_live.log
files=$MODPATH/files

#detected build.prop
[ ! -f $SYSTEM/build.prop ] && report_bug "System build.prop not found"


SDKTARGET=$(getp ro.build.version.sdk $SYSTEM/build.prop)
findarch=$(getp ro.product.cpu.abi $SYSTEM/build.prop | cut -d '-' -f -1)
case $findarch in
arm64) ARCH=arm64 ;;
armeabi) ARCH=arm ;;
x86) ARCH=x86 ;;
x86_64) ARCH=x86_64 ;;
*) report_bug " <$findarch> Your Architecture Not Support" ;;
esac


#mode installation
if [ ! $TYPEINSTALL ] && $KSU; then
TYPEINSTALL=ksu
elif [ ! $TYPEINSTALL ] && [ ! $KSU ]; then
TYPEINSTALL=magisk
elif [ $TYPEINSTALL = "ksu" ]; then
TYPEINSTALL=ksu
sedlog "- Type install KOPI installer convert to ksu module"a
elif [ $TYPEINSTALL = "magisk" ]; then
TYPEINSTALL=magisk
sedlog "- Type install KOPI installer convert to magisk module"
elif [ $TYPEINSTALL = "kopi" ]; then
TYPEINSTALL=kopi
sedlog "- Type install KOPI installer convert to kopi module"
else
TYPEINSTALL=kopi
sedlog "- Type install is not found, use default to kopi module"
fi


# Test /data rw partition
case $TYPEINSTALL in
magisk)
	DIR_TEST=/data/adb/test8989
	cdir $DIR_TEST
	touch $DIR_TEST/io
	if [ -f $DIR_TEST/io ]; then
		del $DIR_TEST
	else
		report_bug "/data partition is encrypt or read only"
	fi
;;
esac

for CCACHE in $LITEGAPPS/log $tmp; do
	test -d $CCACHE && del $CCACHE && cdir $CCACHE || cdir $CCACHE
done

#functions litegapps info module.prop and build.prop
litegapps_info
print " "


#bin
bin=$MODPATH/bin/$ARCH

chmod -R 755 $bin

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

#extract tar files
printlog "- Extracting Archive"
if [ -f $files/files.tar ]; then
	sedlog "Extracting $files/$ARCH.tar"
	$bin/tar -xf $files/files.tar -C $tmp
	listlog $files
else
	report_bug "File <files.tar> not found !!!"
fi


#### Diference litegapps++
if [ $(getp litegapps_type $MODPATH/module.prop) = litegapps_plus ]; then
	sedlog "LiteGapps Type : LiteGapps Plus"
	litegapps_plus
else
	sedlog "LiteGapps Type : LiteGapps Reguler"
fi
#### End defference litegapps++

#checking sdk files
if [ ! -d $tmp/$ARCH/$SDKTARGET ]; then
	print "+ Architecture Support"
	for A1 in $(ls -1 $tmp); do
		printlog "         $A1"
	done
	print "+ Android Version Support"
	for A2 in $(ls -1 $tmp/$ARCH); do
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

if [ -d $tmp/$ARCH/$SDKTARGET/system ]; then
	sedlog "- Copying system"
	listlog $tmp
	cp -af $tmp/$ARCH/$SDKTARGET/system/* $sysdirtarget/
fi

if [ -d $tmp/$ARCH/$SDKTARGET/vendor ]; then
	sedlog "- Copying vendor"
	listlog $tmp
	cp -af $tmp/$ARCH/$SDKTARGET/vendor/* $vendirtarget/
fi

# modules
SDK=$SDKTARGET
ARCH=$ARCH
MODULES=$MODPATH/modules
MODULE_TMP=$MODPATH/module_tmp
if [ -d $MODULES ] && ! rmdir $MODULES 2>/dev/null; then
	printlog "- Modules Detected"
	for LIST_MODULES in $(find $MODULES -type f); do
	sedlog "- Extracting <$LIST_MODULES>"
		if [ -f $LIST_MODULES ]; then
			del $MODULE_TMP
			cdir $MODULE_TMP
			unzip -o $LIST_MODULES -d $MODULE_TMP >&2
			if [ -f $MODULE_TMP/module-install.sh ]; then
				chmod 755 $MODULE_TMP/module-install.sh
				. $MODULE_TMP/module-install.sh
			else
				printlog "! Failed installing module <$(basename $LIST_MODULES)> skipping"
				continue
			fi
			del $MODULE_TMP
		fi
	done
fi

#Permissions
printlog "- Set Permissions"
for setperm_dir in $(find $MODPATH/system -type d 2>/dev/null); do
	sedlog "- Set chcon dir : $setperm_dir"
	ch_con $setperm_dir
	sedlog "- Set chmod 755 dir : $setperm_dir"
	chmod 755 $setperm_dir
done

for setperm_file in $(find $MODPATH/system -type f 2>/dev/null); do
	sedlog "- Set chcon file : $setperm_file"
	ch_con $setperm_file
	sedlog "- Set chmod 644 file : $setperm_file"
	chmod 644 $setperm_file
done


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

#Litegapps service
if [ ! -f $LITEGAPPS/disable_post_fs ] || [ $TYPEINSTALL = "magisk" ] || [ $TYPEINSTALL = "ksu" ]; then
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



# cheking memory partition
# $STSTEM $PRODUCT $SYSTEM_EXT is variable in kopi installer
if [ $TYPEINSTALL = kopi ]; then
	printlog "- Checking Memory"
	if [ -d $MODPATH/system ] && [ ! -d $MODPATH/system/product ] && [ ! -d $MODPATH/system/system_ext ] && [ "$(ls -A $MODPATH/system)" ]; then
		MEM_INSTALL=`du -sk $MODPATH/system | cut -f1`
		MEM_PARTITION=`df -k $SYSTEM | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
		if [[ "$MEM_PARTITION" -eq "$MEM_PARTITION" ]] && [[ "$MEM_PARTITION" -gt "$MEM_INSTALL" ]]; then
			sedlog " memory partition $SYSTEM"
			sedlog " memory install = $MEM_INSTALL kb"
			sedlog " memory free partition $SYSTEM : $MEM_PARTITION kb"
			sedlog " free space is [OK]"
		elif [[ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [[ "$MEM_PARTITION" -le "$MEM_INSTALL" ]]; then
			printlog "! memory partition $SYSTEM"
			printlog "! memory install = $MEM_INSTALL kb"
			printlog "! memory free partition $SYSTEM : $MEM_PARTITION kb"
			printlog "! free space is [ERROR] full memory"
			report_bug "$SYSTEM partition memory is full"
		else
			sedlog "! memory partition $SYSTEM is not detected size"
		fi
	fi
	if [ -d $MODPATH/system/product ] && [ "$(ls -A $MODPATH/system/product)" ]; then
		MEM_INSTALL=`du -sk $MODPATH/system/product | cut -f1`
		MEM_PARTITION=`df -k $PRODUCT | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
		if [[ "$MEM_PARTITION" -eq "$MEM_PARTITION" ]] && [[ "$MEM_PARTITION" -gt $"MEM_INSTALL" ]]; then
			sedlog " memory partition $PRODUCT"
			sedlog " memory install = $MEM_INSTALL kb"
			sedlog " memory free partition $PRODUCT : $MEM_PARTITION kb"
			sedlog " free space is [OK]"
		elif [[ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [[ "$MEM_PARTITION" -le "$MEM_INSTALL" ]]; then
			printlog "! memory partition $PRODUCT"
			printlog "! memory install = $MEM_INSTALL kb"
			printlog "! memory free partition $PRODUCT : $MEM_PARTITION kb"
			printlog "! free space is [ERROR] full memory"
			report_bug "$PRODUCT partition memory is full"
		else
			sedlog "! memory partition $PRODUCT is not detected size"
		fi
	fi
	if [[ -d $MODPATH/system/system_ext ]] && [[ "$(ls -A $MODPATH/system/system_ext)" ]]; then
		MEM_INSTALL=`du -sk $MODPATH/system/system_ext | cut -f1`
		MEM_PARTITION=`df -k $SYSTEM_EXT | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
		if [[ "$MEM_PARTITION" -eq "$MEM_PARTITION" ]] && [[ "$MEM_PARTITION" -gt "$MEM_INSTALL" ]]; then
			sedlog " memory partition $SYSTEM_EXT"
			sedlog " memory install = $MEM_INSTALL kb"
			sedlog " memory free partition $SYSTEM_EXT : $MEM_PARTITION kb"
			sedlog " free space is [OK]"
		elif [[ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [[ "$MEM_PARTITION" -le "$MEM_INSTALL" ]]; then
			printlog "! memory partition $SYSTEM_EXT"
			printlog "! memory install = $MEM_INSTALL kb"
			printlog "! memory free partition $SYSTEM_EXT : $MEM_PARTITION kb"
			printlog "! free space is [ERROR] full memory"
			report_bug "$SYSTEM_EXT partition memory is full"
		else
			sedlog "! memory partition $SYSTEM_EXT is not detected size"
		fi
		
	fi
else
	if [ -d $MODPATH/system ] && [ "$(ls -A $MODPATH/system)" ]; then
		MEM_INSTALL=`du -sk $MODPATH/system | cut -f1`
		MEM_PARTITION=`df -k /data | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
		if [[ "$MEM_PARTITION" -eq "$MEM_PARTITION" ]] && [[ "$MEM_PARTITION" -gt "$MEM_INSTALL" ]]; then
			sedlog " memory partition /data"
			sedlog " memory install = $MEM_INSTALL kb"
			sedlog " memory free partition /data : $MEM_PARTITION kb"
			sedlog " free space is [OK]"
		elif [[ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [[ "$MEM_PARTITION" -le "$MEM_INSTALL" ]]; then
			printlog "! memory partition /data"
			printlog "! memory install = $MEM_INSTALL kb"
			printlog "! memory free partition /data : $MEM_PARTITION kb"
			printlog "! free space is [ERROR] full memory"
			report_bug "/data partition memory is full"
		else
			sedlog "! memory partition /data is not detected size"
		fi
	fi

fi

printlog "- Cleaning cache"
LIST_CACHE="
$tmp
$files
$MODPATH/modules
"
for W in $LIST_CACHE ; do
	sedlog "- removing cache $W"
	del $W
done

if $BOOTMODE; then
printlog "- Opening Ads"
ADS
else
sedlog "- Ads is not running"
fi

if [ $TYPEINSTALL = magisk ]; then
#creating log
make_log
fi
#terminal tips
terminal_tips





