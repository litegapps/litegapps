# Copyright 2020 - 2024 The Litegapps Project
# permissions.sh
# latest update 04-02-2024

chmod 755 $MODPATH/bin/litegapps-functions
#litegapps functions
. $MODPATH/bin/litegapps-functions
LITEGAPPS=/sdcard/Android/litegapps

case $TYPEINSTALL in
magisk | ksu )
chcon -hR u:object_r:system_file:s0 $MAGISKUP/system
find $MAGISKUP/system -type f | while read anjay; do
	dir6070=$(dirname $anjay)
	ch_con $anjay
	chmod 644 $anjay
	ch_con $dir6070
	chmod 755 $dir6070
done
;;
kopi)
	for T in $SYSTEM $PRODUCT $SYSTEM_EXT; do
		if [ -d $T ] && [ "$(ls -A $T)" ]; then
			ls -alZR $T > $LITEGAPPS/log/$(basename ${T}).new
		else
			sedlog "! <$T> not found"
		fi

	done
	make_log
;;
esac
