# The LiteGapps Project
# by wahyu6070
# uninstall.sh (running by update-binary)
#

chmod 755 $MODPATH/bin/litegapps-functions
#litegapps functions
. $MODPATH/bin/litegapps-functions

tmp=$MODPATH/tmp
LITEGAPPS=/data/media/0/Android/litegapps
log=$LITEGAPPS/log/litegapps_uninstall.log
loglive=$LITEGAPPS/log/litegapps_live_uninstall.log
files=$MODPATH/files
SDKTARGET=$(getp ro.build.version.sdk $SYSTEM/build.prop)

findarch=$(getp ro.product.cpu.abi $SYSTEM/build.prop | cut -d '-' -f -1)
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
[ -f $SYSTEM/build.prop ] || report_bug "System build.prop not found"

#mode installation
[ -n "$TYPEINSTALL" ] || TYPEINSTALL=magisk_module
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
	for LIST_MODULES in $(find $MODULES -type f); do
	sedlog "- Extracting <$LIST_MODULES>"
		if [ -f $LIST_MODULES ]; then
			del $MODULE_TMP
			cdir $MODULE_TMP
			unzip -o $LIST_MODULES -d $MODULE_TMP >/dev/null
			if [ -f $MODULE_TMP/module-uninstall.sh ]; then
				chmod 755 $MODULE_TMP/module-uninstall.sh
				. $MODULE_TMP/module-uninstall.sh
			else
				printlog "! Failed installing module <$(basename $LIST_MODULES)> skipping"
				continue
			fi
			del $MODULE_TMP
		fi
	done
fi


if [ -f $KOPIMOD/list_install_system ]; then
	for i in $(cat $KOPIMOD/list_install_system); do
		sedlog "- Deleteting <$SYSTEM/$i>"
		if [ -f $SYSTEM/$i ]; then
			del $SYSTEM/$i
			if [ $? = 0 ]; then
				sedlog "- Removing File <$SYSTEM/$i> [OK]"
			else
				sedlog "- Removing File <$SYSTEM/$i> [ERROR]"
			fi
			rmdir $(dirname $SYSTEM/$i) 2>/dev/null
			if [ $? = 0 ]; then
				sedlog "- Removing Dir <$(dirname $SYSTEM/$i)> [OK]"
			else
				sedlog "- Removing Dir <$(dirname $SYSTEM/$i)> [ERROR]"
			fi
		fi
	done
fi


if [ -f $KOPIMOD/list_install_vendor ]; then
	for i in $(cat $KOPIMOD/list_install_vendor); do
		sedlog "- Deleteting <$VENDOR/$i>"
		if [ -f $VENDOR/$i ]; then
			del $VENDOR/$i
			if [ $? = 0 ]; then
				sedlog "- Removing File <$VENDOR/$i> [OK]"
			else
				sedlog "- Removing File <$VENDOR/$i> [ERROR]"
			fi
			rmdir $(dirname $VENDOR/$i) 2>/dev/null
			if [ $? = 0 ]; then
				sedlog "- Removing Dir <$(dirname $VENDOR/$i)> [OK]"
			else
				sedlog "- Removing Dir <$(dirname $VENDOR/$i)> [ERROR]"
			fi
		fi
	done
fi

if [ -f $KOPIMOD/list_install_product ]; then
	for i in $(cat $KOPIMOD/list_install_product); do
		sedlog "- Deleteting <$PRODUCT/$i>"
		if [ -f $PRODUCT/$i ]; then
			del $PRODUCT/$i
			if [ $? = 0 ]; then
				sedlog "- Removing File <$PRODUCT/$i> [OK]"
			else
				sedlog "- Removing File <$PRODUCT/$i> [ERROR]"
			fi
			rmdir $(dirname $PRODUCT/$i) 2>/dev/null
			if [ $? = 0 ]; then
				sedlog "- Removing Dir <$(dirname $PRODUCT/$i)> [OK]"
			else
				sedlog "- Removing Dir <$(dirname $PRODUCT/$i)> [ERROR]"
			fi
		fi
	done
fi

if [ -f $KOPIMOD/list_install_system_ext ]; then
	for i in $(cat $KOPIMOD/list_install_system_ext); do
		sedlog "- Deleteting <$SYSTEM_EXT/$i>"
		if [ -f $SYSTEM_EXT/$i ]; then
			del $SYSTEM_EXT/$i
			if [ $? = 0 ]; then
				sedlog "- Removing File <$SYSTEM_EXT/$i> [OK]"
			else
				sedlog "- Removing File <$SYSTEM_EXT/$i> [ERROR]"
			fi
			rmdir $(dirname $SYSTEM_EXT/$i) 2>/dev/null
			if [ $? = 0 ]; then
				sedlog "- Removing Dir <$(dirname $SYSTEM_EXT/$i)> [OK]"
			else
				sedlog "- Removing Dir <$(dirname $SYSTEM_EXT/$i)> [ERROR]"
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