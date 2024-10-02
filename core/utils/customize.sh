#
# customize.sh 
#

chmod 755 $MODPATH/bin/litegapps-functions
#litegapps functions
. $MODPATH/bin/litegapps-functions

# main path
INITIAL install

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
	$bin/tar -xf $files/files.tar -C $TMPDIR
	listlog $files
else
	report_bug "File <files.tar> not found !!!"
fi


#### Diference litegappsX
if [ $(getp litegapps_type $MODPATH/module.prop) = litegappsx ]; then
	sedlog "LiteGapps Type : LiteGapps X"
	litegappsx
else
	sedlog "LiteGapps Type : LiteGapps Reguler"
fi
#### End defference litegappsX

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

if [ -d $TMPDIR/$ARCH/$API/system ]; then
	sedlog "- Copying system"
	listlog $TMPDIR
	cp -af $TMPDIR/$ARCH/$API/system/* $sysdirtarget/
fi

if [ -d $TMPDIR/$ARCH/$API/vendor ]; then
	sedlog "- Copying vendor"
	listlog $TMPDIR
	cp -af $TMPDIR/$ARCH/$API/vendor/* $vendirtarget/
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
			else
				printlog "! Failed installing module <$(basename $LIST_MODULES)> skipping"
				continue
			fi
			del $MODULE_TMP
		fi
	done
fi

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

#Litegapps service
if [ ! -f $LITEGAPPS/disable_post_fs ] && [ $TYPEINSTALL = magisk ] || [ $TYPEINSTALL = ksu ]; then
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

for YJ in magisk ksu apatch; do

if [ $TYPEINSTALL = $YJ ]; then
#creating log
make_log
break
fi
done

#terminal tips
terminal_tips

if [ $TYPEINSTALL = kopi ] && [ -d $SYSTEM/addon.d ]; then
	printlog "! Your ROM does not support addon.d ... and you must install litegapps after reinstalling or updating the ROM."
	
fi

