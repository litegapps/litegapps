# The LiteGapps Project
# install.sh (run by update-binary)
# latest update 28-01-2022
#

litegapps=/data/media/0/Android/litegapps
log=$litegapps/log/litegapps.log
loglive=$litegapps/log/litegapps_live.log

#
#
sedlog "- install.sh script"
if [ -f $MODPATH/bin/kopi ]; then
	sedlog "- Copying $MODPATH/bin/kopi"
	cp -pf $MODPATH/bin/kopi $KOPIMOD/
	chmod 775 $KOPIMOD/kopi
	listlog $KOPIMOD
fi

if [ $TYPEINSTALL = kopi ]; then
	test ! -d $SYSTEM/addon.d && mkdir -p $SYSTEM/addon.d
	sedlog "- Copying $MODPATH/bin/27-litegapps.sh to $SYSTEM/addon.d/"
	cp -pf $MODPATH/bin/27-litegapps.sh $SYSTEM/addon.d/
	chmod 755 $SYSTEM/addon.d/27-litegapps.sh
	listlog $SYSTEM/addon.d
fi
