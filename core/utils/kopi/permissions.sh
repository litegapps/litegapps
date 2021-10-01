# LiteGapps
# permissions.sh
# latest update 01-10-2021

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
