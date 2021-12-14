# The LiteGapps Project
# permissions.sh
# latest update 01-12-2021

chmod 755 $MODPATH/bin/litegapps-functions
#litegapps functions
. $MODPATH/bin/litegapps-functions
LITEGAPPS=/sdcard/Android/litegapps

if [ $TYPEINSTALL = magisk ]; then
chcon -hR u:object_r:system_file:s0 $MAGISKUP/system
find $MAGISKUP/system -type f | while read anjay; do
	dir6070=$(dirname $anjay)
	ch_con $anjay
	chmod 644 $anjay
	ch_con $dir6070
	chmod 755 $dir6070
done
fi

if [ $TYPEINSTALL = kopi ]; then
	for T in $SYSDIR $PRODUCT $SYSTEM_EXT; do
		if [ -d $T ] && [ "$(ls -A $T)" ]; then
			ls -alZR $T > $LITEGAPPS/log/$(basename ${T}).new
		else
			sedlog "! <$T> not found"
		fi

	done
	make_log
fi
