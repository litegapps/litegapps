litegapps=/data/media/0/Android/litegapps
log=$litegapps/log/litegapps.log
loglive=$litegapps/log/litegapps_live.log


device_abpartition=$(getprop ro.build.ab_update)
[ -n "$device_abpartition" ] || device_abpartition="A only"
	
MODULEVERSION=`getp version $MODPATH/module.prop`
MODULECODE=`getp versionCode $MODPATH/module.prop`
MODULENAME=`getp name $MODPATH/module.prop`
MODULEANDROID=`getp android $MODPATH/module.prop`
MODULEDATE=`getp date $MODPATH/module.prop`
MODULEAUTHOR=`getp author $MODPATH/module.prop`
ANDROIDVERSION=$(getp ro.build.version.release $SYSDIR/build.prop)
ANDROIDMODEL=$(getp ro.product.vendor.model $VENDIR/build.prop)
ANDROIDDEVICE=$(getp ro.product.vendor.device $VENDIR/build.prop)
ANDROIDROM=$(getp ro.build.display.id $SYSDIR/build.prop)
API=`getp ro.build.version.sdk $SYSDIR/build.prop`
device_abpartition=$(getprop ro.build.ab_update)
[ -n "$device_abpartition" ] || device_abpartition="A only"
printlog " Uninstall Mode"
printlog "____________________________________"
printlog "|"
printlog "| Name            : $MODULENAME"
printlog "| Version         : $MODULEVERSION"
printlog "| Build date      : $MODULEDATE"
printlog "| By              : $MODULEAUTHOR"
printlog "|___________________________________"
printlog "|"
printlog "| Telegram        : https://t.me/litegapps"
printlog "|___________________________________"
printlog "|              Device Info"
printlog "| Name Rom        : $ANDROIDROM"
printlog "| Device          : $ANDROIDMODEL ($ANDROIDDEVICE)"
printlog "| Android Version : $ANDROIDVERSION"
printlog "| Architecture    : $ARCH"
printlog "| Sdk             : $SDKTARGET"
printlog "| Seamless        : $device_abpartition"
printlog "|___________________________________"



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
test [ -f $system/addon.d/27-litegapps.sh ] && del $system/addon.d/27-litegapps.sh
printlog "- Uninstalling successfully"
printlog "- Thank you for using LiteGapps"