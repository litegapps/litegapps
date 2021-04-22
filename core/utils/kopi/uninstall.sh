litegapps=/data/media/0/Android/litegapps
log=$litegapps/log/litegapps.log
loglive=$litegapps/log/litegapps_live.log

if [ -f $KOPIMOD/list_install_system ]; then
	for i in $(cat $KOPIMOD/list_install_system); do
		sedlog "- Deleteting $system/$i"
		if [ -f $system/$i ] && [ $i != vendor ]; then
			del $system/$i || sedlog "- Failed deleting $system/$i"
		fi
	done
fi

if [ -f $KOPIMOD/list_install_vendor ]; then

	for i in $(cat $KOPIMOD/list_install_vendor); do
		sedlog "- Deleteting /vendor/$i"
		if [ -f vendor/$i ]; then
			del /vendor/$i || sedlog "- Failed deleting /vendor$i"
		fi
	done
fi
test [ -f $system/addon.d/27-litegapps.sh ] && del $system/addon.d/27-litegapps.sh
printlog "- Uninstalling successfully"
