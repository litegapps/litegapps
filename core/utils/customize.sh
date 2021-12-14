# LiteGapps
# customize.sh 
# latest update 04-10-2021
# By wahyu6070

chmod 755 $MODPATH/bin/litegapps-functions
#litegapps functions
. $MODPATH/bin/litegapps-functions
#path
if [ -f /system_root/system/build.prop ]; then
	SYSDIR=/system_root/system 
elif [ -f /system/system/build.prop ]; then
	SYSDIR=/system/system
else
	SYSDIR=/system
fi
# /product dir (android 10+)
if [ ! -L $SYSDIR/product ]; then
	PRODUCT=$SYSDIR/product
else
	PRODUCT=/product
fi

# /system_ext dir (android 11+)
if [ ! -L $SYSDIR/system_ext ]; then
	SYSTEM_EXT=$SYSDIR/system_ext
else
	SYSTEM_EXT=/system_ext
fi

VENDIR=/vendor

tmp=$MODPATH/tmp
LITEGAPPS=/data/media/0/Android/litegapps
log=$LITEGAPPS/log/litegapps.log
loglive=$LITEGAPPS/log/litegapps_live.log
files=$MODPATH/files

#detected build.prop
[ ! -f $SYSDIR/build.prop ] && report_bug "System build.prop not found"


SDKTARGET=$(getp ro.build.version.sdk $SYSDIR/build.prop)
findarch=$(getp ro.product.cpu.abi $SYSDIR/build.prop | cut -d '-' -f -1)
case $findarch in
arm64) ARCH=arm64 ;;
armeabi) ARCH=arm ;;
x86) ARCH=x86 ;;
x86_64) ARCH=x86_64 ;;
*) report_bug " <$findarch> Your Architecture Not Support" ;;
esac

for CCACHE in $LITEGAPPS/log $tmp; do
	test -d $CCACHE && del $CCACHE && cdir $CCACHE || cdir $CCACHE
done

#functions litegapps info module.prop and build.prop
litegapps_info
print " "
#mode installation
[ $TYPEINSTALL ] || TYPEINSTALL=magisk_module
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
printlog "- Extracting archive"
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
	find $tmp/$ARCH/$SDKTARGET -name *.tar -type f 2>/dev/null | while read tarfile; do
	tarout=`echo "$tarfile" | cut -d '.' -f -1`
	tarin=$tarfile
	tarout=`dirname "$(readlink -f $tarin)"`
	while_log "- Extracting tar : $tarin"
	$bin/tar -xf $tarin -C $tarout
	del $tarin
	done >> $loglive

	#Building Gapps
	datanull=/data/adb/abcdfghijk
	cdir $datanull
	#$datanull is fix creating ..apk
	print "- Building Gapps"
	find $tmp/$ARCH/$SDKTARGET -name *app -type d 2>/dev/null | while read DIRAPP; do
		for WAHYU1 in $(ls -1 $DIRAPP); do
			if [ -d $DIRAPP/$WAHYU1/$WAHYU1 ]; then
				apk_zip_level="$(getp litegapps_apk_compress_level $MODPATH/module.prop)"
				apkdir="$DIRAPP/$WAHYU1/$WAHYU1"
				while_log "- Creating Archive Apk : $apkdir"
				cd $apkdir
				$bin/zip -r${apk_zip_level} $apkdir.apk *
				del $apkdir
				cd $datanull
			fi
		done
	done >/dev/null
	del $datanull


	#Zipalign
	printlog "- Zipalign"
	find $tmp/$ARCH/$SDKTARGET -name *app -type d 2>/dev/null | while read DIRAPP2; do
		for WAHYU2 in $(ls -1 $DIRAPP2); do
			if [ -f $DIRAPP2/$WAHYU2/${WAHYU2}.apk ]; then
				APK_FILE="$DIRAPP2/$WAHYU2/${WAHYU2}.apk"
				while_log "- Zipalign <$APK_FILE>"
				$bin/zipalign -f -p -v 4 $APK_FILE $DIRAPP2/$WAHYU2/new.apk
				del $APK_FILE
				mv $DIRAPP2/$WAHYU2/new.apk $APK_FILE
			else
				while_log "- Failed Zipalign <$DIRAPP2/$WAHYU2/${WAHYU2}.apk>"
			fi
		done
	done >/dev/null
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
	printlog "- Modules detected"
	for LIST_MODULES in $(find $MODULES -type f); do
	sedlog "- Extracting <$LIST_MODULES>"
		if [ -f $LIST_MODULES ]; then
			del $MODULE_TMP
			cdir $MODULE_TMP
			unzip -o $LIST_MODULES -d $MODULE_TMP >/dev/null
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


#litegapps menu
cdir $MODPATH/system/bin
cp -pf $MODPATH/bin/litegapps $MODPATH/system/bin/
chmod 755 $MODPATH/system/bin/litegapps

#Litegapps post fs
if [ $TYPEINSTALL != kopi ] && [ -d /data/adb/service.d ] && [ ! -f $LITEGAPPS/disable_post_fs ]; then
	print "- Installing litegapps post-fs"
	cp -pf $MODPATH/bin/litegapps-post-fs /data/adb/service.d/
	chmod 755 /data/adb/service.d/litegapps-post-fs
fi

printlog "- Cleaning cache"
for W in $tmp $files $MODPATH/modules; do
	test -d $W && del $W
done


# cheking memory partition
# $STSTEM $PRODUCT $SYSTEM_EXT is variable in kopi installer
if [ $TYPEINSTALL = kopi ]; then
	printlog "- Checking Memory"
	if [ -d $MODPATH/system/product ] && [ "$(ls -A $MODPATH/system/product)" ]; then
		MEM_INSTALL=`du -sk $MODPATH/system/product | cut -f1`
		MEM_PARTITION=`df $PRODUCT | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
		if [ $MEM_PARTITION -eq $MEM_PARTITION ] && [ $MEM_PARTITION -gt $MEM_INSTALL ]; then
			sedlog " memory partition /product"
			sedlog " memory install = $MEM_INSTALL"
			sedlog " memory free partition /product : $MEM_PARTITION "
			sedlog " free space is [OK]"
		else
			printlog "! memory partition /product"
			printlog "! memory install = $MEM_INSTALL"
			printlog "! memory free partition /product : $MEM_PARTITION "
			printlog "! free space is [ERROR] full memory"
			report_bug "Insufficient /product partition"
		fi
	fi
	if [ -d $MODPATH/system/system_ext ] && [ "$(ls -A $MODPATH/system/system_ext)" ]; then
		MEM_INSTALL=`du -sk $MODPATH/system/system_ext | cut -f1`
		MEM_PARTITION=`df $SYSTEM_EXT | tail -n 1 | tr -s ' ' | cut -d' ' -f3`
		if [ $MEM_PARTITION -eq $MEM_PARTITION ] && [ $MEM_PARTITION -gt $MEM_INSTALL ]; then
			sedlog " memory partition /system_ext"
			sedlog " memory install = $MEM_INSTALL"
			sedlog " memory free partition /system_ext : $MEM_PARTITION "
			sedlog " free space is [OK]"
		else
			printlog "! memory partition /system_ext"
			printlog "! memory install = $MEM_INSTALL"
			printlog "! memory free partition /system_ext : $MEM_PARTITION "
			printlog "! free space is [ERROR] full memory"
			report_bug "Insufficient /system_ext partition"
		fi
		
	fi
fi

#check partition ro/rw
partition_check

ls -alZR $MODPATH/system > $LITEGAPPS/log/system_modpath
for T in $SYSDIR $PRODUCT $SYSTEM_EXT; do
	if [ -d $T ] && [ "$(ls -A $T)" ]; then
		ls -alZR $T > $LITEGAPPS/log/$(basename ${T}).old
	else
		sedlog "! <$T> not found"
	fi

done

if [ $TYPEINSTALL = magisk ] || [ $TYPEINSTALL = magisk_module ]; then
#creating log
make_log
fi
#terminal tips
terminal_tips
