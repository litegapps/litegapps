# The LiteGapps Project
# by wahyu6070
# uninstall.sh (running by update-binary)
#

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
VENDIR=/vendor
tmp=$MODPATH/tmp
LITEGAPPS=/data/media/0/Android/litegapps
log=$LITEGAPPS/log/litegapps_uninstall.log
loglive=$LITEGAPPS/log/litegapps_live_uninstall.log
files=$MODPATH/files
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
#detected build.prop
[ -f $SYSDIR/build.prop ] || report_bug "System build.prop not found"

#mode installation
[ -n $TYPEINSTALL ] || TYPEINSTALL=magisk_module
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


# uninstall in modules
MODULES=$MODPATH/modules
MODULE_TMP=$MODPATH/module_tmp
if [ -d $MODULES ] && ! rmdir $MODULES 2>/dev/null; then
printlog "- Modules detected"
	for i in $(ls -1 $MODULES); do
	sedlog "- extract <$MODULES/$I>"
		if [ -f $MODULES/$i ]; then
			del $MODULE_TMP
			cdir $MODULE_TMP
			if unzip -o $MODULES/$i -d $MODULE_TMP/ &>2 ; then
				chmod 755 $MODULE_TMP/module-uninstall.sh
				. $MODULE_TMP/module-uninstall.sh
			else
				printlog "! Failed Extracting <$i> skipping"
				continue
			fi
			del $MODULE_TMP
		fi
	done

fi

if [ -f $KOPIMOD/list_install_system ]; then
	for i in $(cat $KOPIMOD/list_install_system); do
		sedlog "- Deleteting $system/$i"
		if [ -f $system/$i ] && [ $i != vendor ]; then
			del $system/$i
			if [ $? = 0 ]; then
				sedlog "- Removing File <$system/$i> [OK]"
			else
				sedlog "- Removing File <$system/$i> [ERROR]"
			fi
			rmdir $(dirname $system/$i) 2>/dev/null
			if [ $? = 0 ]; then
				sedlog "- Removing Dir <$(dirname $system/$i)> [OK]"
			else
				sedlog "- Removing Dir <$(dirname $system/$i)> [ERROR]"
			fi
		fi
	done
fi

if [ -f $KOPIMOD/list_install_vendor ]; then

	for i in $(cat $KOPIMOD/list_install_vendor); do
		sedlog "- Deleteting /vendor/$i"
		if [ -f vendor/$i ]; then
			del $vendor/$i
			if [ $? = 0 ]; then
				sedlog "- Removing File <$vendor/$i> [OK]"
			else
				sedlog "- Removing File <$vendor/$i> [ERROR]"
			fi
			rmdir $(dirname $vendor/$i) 2>/dev/null
			if [ $? = 0 ]; then
				sedlog "- Removing Dir <$(dirname $vendor/$i)> [OK]"
			else
				sedlog "- Removing Dir <$(dirname $vendor/$i)> [ERROR]"
			fi
		fi
	done
fi

if [ -f $system/addon.d/27-litegapps.sh ]; then
	sedlog "- Removing addon.d <27-litegapps.sh>"
	del $system/addon.d/27-litegapps.sh
fi
printlog "- Uninstalling successfully"
printlog "- Thank you for using LiteGapps"