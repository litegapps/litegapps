litegapps=/data/media/0/Android/litegapps
log=$litegapps/log/litegapps.log
loglive=$litegapps/log/litegapps_live.log

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
