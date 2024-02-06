BASED=$BASED
CONFIG=$BASED/config
GAPPS_FILES=$BASED/files
GAPPS=$BASED/gapps
MODULES=$BASED/modules
MODULES_FILES=$BASED/modules_files
read_config(){
	getp "$1" $CONFIG
	}
for i in $GAPPS $GAPPS_FILES $MODULES $MODULES_FILES; do
	[ ! -d $i ] && cdir $i
done
printlog " "
printlog "        Litegapps++ MicroG restore"
printlog " "
for WAHYU in sdk cross_system arch; do
	if [ -f $GAPPS_FILES/$WAHYU.zip ]; then
		printlog "1. Available : $WAHYU.zip"
		printlog "    Size zip : $(du -sh $GAPPS_FILES/$WAHYU.zip | cut -f1)"
		unzip -o $GAPPS_FILES/$WAHYU.zip -d $GAPPS >/dev/null 2>&1
		if [ $? -eq 0 ]; then
		printlog "    Extract status : Successful"
		else
		printlog "    Extract status : Failed"
		printlog "    REMOVING FILES"
		del $GAPPS_FILES/$WAHYU.zip
		exit 1
		fi
	else
		printlog "1. Downloading : $WAHYU.zip"
       curl -L -o $GAPPS_FILES/$WAHYU.zip https://gitlab.com/litegapps/litegapps-server/-/raw/main/litegapps++/microg/$WAHYU.zip >/dev/null 2>&1
       if [  $? -eq 0 ]; then
       	printlog "     Downloading status : Successful"
       	printlog "     File size : $(du -sh $GAPPS_FILES/$WAHYU.zip | cut -f1)"
       else
       	printlog "     Downloading status : Failed"
       	printlog "     ! PLEASE CEK YOUR INTERNET CONNECTION AND RESTORE AGAIN"
       	del $GAPPS_FILES/$WAHYU.zip
       	exit 1
       fi
       unzip -o $GAPPS_FILES/$WAHYU.zip -d $GAPPS >/dev/null 2>&1
       if [ $? -eq 0 ]; then
       	printlog "     Unzip : $GAPPS_FILES/$WAHYU.zip"
       	printlog "     unzip status : Successful"
       else
       	printlog "     Unzip : $GAPPS_FILES/$WAHYU.zip"
       	printlog "     unzip status : Failed"
       	printlog "     REMOVING FILES"
       	del $GAPPS_FILES/$WAHYU.zip
       	exit 1
       fi
	fi
done