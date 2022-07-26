# Copyright 2020 - 2022 The Litegapps Project
# customize.sh 
# latest update 15-07-2022
# By wahyu6070

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

#developer mode
if [ -f /sdcard/Android/litegapps/mode_developer ]; then
	DEV_MODE=ON
else
	DEV_MODE=OFF
fi

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
[ $TYPEINSTALL ] || TYPEINSTALL=magisk
case $TYPEINSTALL in
kopi)
	sedlog "- Type install KOPI module"
;;
magisk)
	sedlog "- Type install KOPI installer convert to magisk module"
;;
*)
	sedlog "- Type install MAGISK module"
;;
esac

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
elif [ -f $files/files.tar.7z ]; then
	format_file=7za
elif [ -f $files/files.tar.br ]; then
	format_file=brotli
elif [ -f $files/files.tar.gz ]; then
	format_file=gzip
elif [ -f $files/files.tar.zst ]; then
	format_file=zstd
elif [ -f $files/files.tar.zip ]; then
	format_file=zip
else
	report_bug "File Gapps not found or format not support"
	listlog $files
fi
sedlog "Format file : $format_file"

#checking architecture executable support
test ! -f $bin/tar && report_bug "your architecture is not supported or not compatible with your device"

#checking executable
for W in $format_file tar zip zipalign; do
	test ! -f $bin/$W && report_bug "Please add executable <$W> in <$bin/$W>"
done

#extracting file format
printlog "- Extracting Gapps"
case $format_file in
xz)
	$bin/xz -d $files/files.tar.xz || report_bug "Failed extract <files.tar.xz>"
;;
7za)
	$bin/7za e -y $files/files.tar.7z >/dev/null || report_bug "Failed extract <files.tar.7z>"
	;;
gunzip)
	$bin/gzip -d $files/files.tar.gz || report_bug "Failed extract <files.tar.gz>"
	;;
brotli)
	$bin/brotli -dj $files/files.tar.br || report_bug "Failed extract <files.tar.br>"
	;;
zstd)
	$bin/zstd -df --rm $files/files.tar.zst || report_bug "Failed extract <files.tar.zst>"
	;;
zip)
	unzip -o $files/files.tar.zip -d $files >/dev/null || report_bug "Failed extract <files.tar.zip>"
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

#cheking sdk files
[ ! -d $tmp/$ARCH/$SDKTARGET ] && report_bug "Your Android Version Not Support"
#using litegapps compress apk or google default apk

if [ "$(getp litegapps_apk_compress $MODPATH/module.prop)" = litegapps_compress ]; then
	sedlog "Using litegapps system compress apk"
	#extrack tar files
	print "- Extracting tar file"
	for tarfile in $(find $tmp/$ARCH/$SDKTARGET -name *.tar -type f); do
		tarout=`echo "$tarfile" | cut -d '.' -f -1`
		tarin=$tarfile
		tarout=`dirname "$(readlink -f $tarin)"`
		sedlog "- Extracting tar : $tarin"
		$bin/tar -xf $tarin -C $tarout
		del $tarin
	done
	
	#Building Gapps
	print "- Building Gapps"
	for DIRAPP in $(find $tmp/$ARCH/$SDKTARGET -name *app -type d); do
		for WAHYU1 in $(ls -1 $DIRAPP); do
			if [ -d $DIRAPP/$WAHYU1/$WAHYU1 ]; then
				apk_zip_level="$(getp litegapps_apk_compress_level $MODPATH/module.prop)"
				apkdir="$DIRAPP/$WAHYU1/$WAHYU1"
				sedlog "- Creating Archive Apk : $apkdir"
				cd $apkdir
				$bin/zip -r${apk_zip_level} ${apkdir}.apk * > /dev/null 2>&1
				[ $? -eq 0 ] || report_bug "failed make apk <${apkdir}.apk>"
				del $apkdir
			else
				sedlog "! Directory apk not found <$DIRAPP/$WAHYU1/$WAHYU1>"
			fi
		done
	done
	
	#Zipalign
	printlog "- Zipalign"
	for DIRAPP2 in $(find $tmp/$ARCH/$SDKTARGET -name *app -type d); do
		for WAHYU2 in $(ls -1 $DIRAPP2); do
			if [ -f $DIRAPP2/$WAHYU2/${WAHYU2}.apk ]; then
				APK_FILE="$DIRAPP2/$WAHYU2/${WAHYU2}.apk"
				sedlog "- Zipalign <$APK_FILE>"
				$bin/zipalign -f -p -v 4 $APK_FILE $DIRAPP2/$WAHYU2/new.apk > /dev/null 2>&1
				[ $? -eq 0 ] || report_bug "failed zipalign <$APK_FILE>"
				del $APK_FILE
				mv $DIRAPP2/$WAHYU2/new.apk $APK_FILE
			else
				sedlog "! Failed Zipalign <$DIRAPP2/$WAHYU2/${WAHYU2}.apk> dir not found"
			fi
		done
	done
	
else
	sedlog "Using google default system compress apk"
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
find $MODPATH/system -type d 2>/dev/null | while read setperm_dir; do
	while_log "- Set chcon dir : $setperm_dir"
	ch_con $setperm_dir
	while_log "- Set chmod 755 dir : $setperm_dir"
	chmod 755 $setperm_dir
done >> $loglive

printlog "- Set Permissions"
find $MODPATH/system -type f 2>/dev/null | while read setperm_file; do
	while_log "- Set chcon file : $setperm_file"
	ch_con $setperm_file
	while_log "- Set chmod 644 file : $setperm_file"
	chmod 644 $setperm_file
done >> $loglive


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

#Litegapps post fs
if [ $TYPEINSTALL != kopi ] && [ -d /data/adb/service.d ] && [ ! -f $LITEGAPPS/disable_post_fs ]; then
	printlog "- Installing litegapps post-fs"
	cp -pf $MODPATH/bin/litegapps-post-fs /data/adb/service.d/
	chmod 755 /data/adb/service.d/litegapps-post-fs
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


# cheking memory partition
# $STSTEM $PRODUCT $SYSTEM_EXT is variable in kopi installer
if [ $TYPEINSTALL = kopi ]; then
	printlog "- Checking Memory"
	if [ -d $MODPATH/system ] && [ ! -d $MODPATH/system/product ] && [ ! -d $MODPATH/system/system_ext ] && [ "$(ls -A $MODPATH/system)" ]; then
		MEM_INSTALL=`du -sk $MODPATH/system | cut -f1`
		MEM_PARTITION=`df -k $SYSTEM | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
		if [ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [ "$MEM_PARTITION" -gt "$MEM_INSTALL" ]; then
			sedlog " memory partition $SYSTEM"
			sedlog " memory install = $MEM_INSTALL kb"
			sedlog " memory free partition $SYSTEM : $MEM_PARTITION kb"
			sedlog " free space is [OK]"
		else
			printlog "! memory partition $SYSTEM"
			printlog "! memory install = $MEM_INSTALL kb"
			printlog "! memory free partition $SYSTEM : $MEM_PARTITION kb"
			printlog "! free space is [ERROR] full memory"
			report_bug "$SYSTEM partition memory is full"
		fi
	fi
	if [ -d $MODPATH/system/product ] && [ "$(ls -A $MODPATH/system/product)" ]; then
		MEM_INSTALL=`du -sk $MODPATH/system/product | cut -f1`
		MEM_PARTITION=`df -k $PRODUCT | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
		if [ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [ "$MEM_PARTITION" -gt $"MEM_INSTALL" ]; then
			sedlog " memory partition $PRODUCT"
			sedlog " memory install = $MEM_INSTALL kb"
			sedlog " memory free partition $PRODUCT : $MEM_PARTITION kb"
			sedlog " free space is [OK]"
		else
			printlog "! memory partition $PRODUCT"
			printlog "! memory install = $MEM_INSTALL kb"
			printlog "! memory free partition $PRODUCT : $MEM_PARTITION kb"
			printlog "! free space is [ERROR] full memory"
			report_bug "$PRODUCT partition memory is full"
		fi
	fi
	if [ -d $MODPATH/system/system_ext ] && [ "$(ls -A $MODPATH/system/system_ext)" ]; then
		MEM_INSTALL=`du -sk $MODPATH/system/system_ext | cut -f1`
		MEM_PARTITION=`df -k $SYSTEM_EXT | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
		if [ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [ "$MEM_PARTITION" -gt "$MEM_INSTALL" ]; then
			sedlog " memory partition $SYSTEM_EXT"
			sedlog " memory install = $MEM_INSTALL kb"
			sedlog " memory free partition $SYSTEM_EXT : $MEM_PARTITION kb"
			sedlog " free space is [OK]"
		else
			printlog "! memory partition $SYSTEM_EXT"
			printlog "! memory install = $MEM_INSTALL kb"
			printlog "! memory free partition $SYSTEM_EXT : $MEM_PARTITION kb"
			printlog "! free space is [ERROR] full memory"
			report_bug "$SYSTEM_EXT partition memory is full"
		fi
		
	fi
else
	if [ -d $MODPATH/system ] && [ "$(ls -A $MODPATH/system)" ]; then
		MEM_INSTALL=`du -sk $MODPATH/system | cut -f1`
		MEM_PARTITION=`df -k /data | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
		if [ "$MEM_PARTITION" -eq "$MEM_PARTITION" ] && [ "$MEM_PARTITION" -gt "$MEM_INSTALL" ]; then
			sedlog " memory partition /data"
			sedlog " memory install = $MEM_INSTALL kb"
			sedlog " memory free partition /data : $MEM_PARTITION kb"
			sedlog " free space is [OK]"
		else
			printlog "! memory partition /data"
			printlog "! memory install = $MEM_INSTALL kb"
			printlog "! memory free partition /data : $MEM_PARTITION kb"
			printlog "! free space is [ERROR] full memory"
			report_bug "/data partition memory is full"
		fi
		
	fi

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

if [ $TYPEINSTALL = magisk ]; then
#creating log
make_log
fi
#terminal tips
terminal_tips

