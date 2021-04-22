#Litegapps
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
sedlog "- Copying $MODPATH/bin/27-litegapps.sh to $system/addon.d/"
cp -pf $MODPATH/bin/27-litegapps.sh $system/addon.d/
chmod 755 $system/addon.d/27-litegapps.sh
listlog $system/addon.d
fi

ls -alZR $system > $litegapps/log/old_system.log