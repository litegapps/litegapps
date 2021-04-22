#Litegapps
litegapps=/data/media/0/Android/litegapps
log=$litegapps/log/litegapps.log
loglive=$litegapps/log/litegapps_live.log

#
#

if [ $TYPEINSTALL = magisk ]; then
ls -alZR $modup >> $loglive
find $modup/system -type f | while read anjay; do
	dir6070=$(dirname $anjay)
	while_log "- Set ch_con file $anjay"
	ch_con $anjay
	while_log "- Set chmod file $anjay"
	chmod 644 $anjay
	while_log "- Set ch_con dir $dir6070"
	ch_con $dir6070
	while_log "- Set chmod file $dir6070"
	chmod 755 $dir6070
done >> $loglive
ls -alZR $modup >> $loglive
fi
ls -alZR $system > $litegapps/log/new_system.log