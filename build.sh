# Litegapps Core Script
#
#
base="`dirname $(readlink -f "$0")`"
chmod -R 755 $base/bin
. $base/bin/core-functions
case $(uname -m) in
*x86*) ARCH32=x86 ;;
*) ARCH32=arm ;;
esac

tmp=$base/tmp
bin=$base/bin/$ARCH32
log=$base/log/make.log
loglive=$base/log/make_live.log
out=$base/output


PROP_VERSION=`get_config version`
PROP_VERSIONCODE=`get_config version.code`
PROP_CODENAME=`get_config codename`
PROP_BUILDER=`get_config name.builder`
PROP_SET_TIME=`get_config set.time.stamp`
PROP_SET_DATE=`get_config date.time`
PROP_COMPRESSION=`get_config compression`
PROP_COMPRESSION_LEVEL=`get_config compression.level`
PROP_ZIP_APK_PROP_COMPRESSION=`get_config zip.apk.compression`
PROP_ZIP_LEVEL=`get_config zip.level`

case $(get_config build.status) in
	6070) 
		PROP_STATUS=official ;;
	wahyu6070)
		PROP_STATUS=official ;;
	*) 
		PROP_STATUS=unofficial ;;
esac
case $(get_config zip.level) in
	0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) ziplevel=$(get_config zip.level) ;;
	*) ziplevel=1 ;;
esac
#process tmp
for P_TMP in $base/log $tmp; do
	[ -d $P_TMP ] && del $P_TMP && cdir $P_TMP || cdir $P_TMP
done

#################################################
#Cleaning dir
#################################################
if [ "$1" = clean ]; then
	list_fol="
	$base/output
	$base/core/litegapps/gapps
	$base/core/litegapps++/gapps
	$base/etc/extractor/input
	$base/etc/extractor/output
	$base/log
	"
	if [ -f $base/files/bin.zip ] && [ $base/files/litegapps.zip ] && [ $base/files/litegapps++.zip ]; then
		printlog "!!! files <bin.zip> <litegapps.zip> <litegapps++.zip> found"
		printlog " do you want to removing files ?"
		echo -n " yes/no : "
		read filesrm
		case $filesrm in
		y | Y | yes | YES)
		printlog "- Removing files"
		del $base/files
		cdir $base/files
		touch $base/files/placeholder
		;;
		*)
		printlog "Skipping removing files"
		;;
		esac
	else
		printlog "- Removing files"
		del $base/files
		cdir $base/files
		touch $base/files/placeholder
	fi
	for W in $list_fol
	do
	 if [ -d $W ]; then
	 	printlog "cleaning $W"
	 	del $W
	 	cdir $W
	 	touch $W/placeholder
	 fi
	done
	for W2 in $base/bin/arm $base/bin/x86; do
		if [ -d $W2 ]; then
			printlog "cleaning $W"
			del $W2
		fi
	done
	[ -d $tmp ] && del $tmp
	print "- Cleaning Done"
	exit 0
fi


#################################################
# Upload
#################################################
if [ "$1" = upload ]; then
	clear
	printlog " Litegapps Uploading files"
	printlog " "
	for W in sftp scp; do
		if $(command -v $W >/dev/null); then
		printlog "Executable <$W> <$(command -v $W)> [OK]"
		else
		printlog "Executable <$W> [ERROR] not found"
		exit 1
		fi
	done
	printlog " Total Size file upload : $(du -sh $out)"
	printlog " Server : Sourceforge"
	printlog " Username account sourceforge"
	echo -n " User name = "
	read USERNAME
	cd $out
	find * -type f -name *MAGISK* | while read INPUT_OUT; do
	SC=$INPUT_OUT
	TG=/home/frs/project/litegapps/$SC
	printlog "- Uploading <$SC> to <$TG>"
	scp $SC $USERNAME@web.sourceforge.net:$TG
	[ $? ] && del $SC && rmdir $(dirname $SC) >/dev/null
	done
	find * -type f -name *RECOVERY* | while read INPUT_OUT; do
	SC=$INPUT_OUT
	TG=/home/frs/project/litegapps/$SC
	printlog "- Uploading <$SC> to <$TG>"
	scp $SC $USERNAME@web.sourceforge.net:$TG
	[ $? ] && del $SC && rmdir $(dirname $SC) >/dev/null
	done
	find * -type f -name *AUTO* | while read INPUT_OUT; do
	SC=$INPUT_OUT
	TG=/home/frs/project/litegapps/$SC
	printlog "- Uploading <$SC> to <$TG>"
	scp $SC $USERNAME@web.sourceforge.net:$TG
	[ $? ] && del $SC && rmdir $(dirname $SC) >/dev/null
	done
	exit 0
fi
#################################################
# Restore
#################################################
if [ "$1" = restore ]; then
	printlog "- Checking executable"
	for W in curl unzip zip; do
		if $(command -v $W >/dev/null); then
			printlog "Executable <$W> <$(command -v $W)> [OK]"
		else
			printlog "Executable <$W> [ERROR] not found"
		exit 1
		fi
	done
	FILES=$base/files
	if [ -f $FILES/litegapps.zip ] && [ -f $FILES/litegapps++.zip ] && [ -f $FILES/bin.zip ]; then
	printlog "- Checking ZIP integrity"
	for W2 in bin.zip litegapps.zip litegapps++.zip; do
		if  $(zip -T $FILES/$W2 >/dev/null); then
		printlog "<$FILES/$W2> ZIP [OK]"
		else
		printlog "<$FILES/$W2> ZIP [ERROR]"
		exit 1
		fi
	done
	printlog "- Extract $FILES/bin.zip"
	unzip -o $FILES/bin.zip -d $base/bin
	printlog "- Extract $FILES/litegapps.zip"
	unzip -o $FILES/litegapps.zip -d $base/core/litegapps/
	printlog "- Extract $FILES/litegapps++.zip"
	unzip -o $FILES/litegapps++.zip -d $base/core/litegapps++/
	else
	printlog "- Downloading bin.zip"
	curl -L -o $FILES/bin.zip https://sourceforge.net/projects/litegapps/files/files/bin.zip/download
	printlog "- Downloading litegapps.zip"
	curl -L -o $FILES/litegapps.zip https://sourceforge.net/projects/litegapps/files/files/litegapps.zip/download
	printlog "- Downloading litegapps++.zip"
	curl -L -o $FILES/litegapps++.zip https://sourceforge.net/projects/litegapps/files/files/litegapps%2B%2B.zip/download
	printlog "- Checking ZIP integrity"
	for W2 in bin.zip litegapps.zip litegapps++.zip; do
		if  $(zip -T $FILES/$W2 >/dev/null); then
		printlog "<$FILES/$W2> ZIP [OK]"
		else
		printlog "<$FILES/$W2> ZIP [ERROR]"
		exit 1
		fi
	done
	printlog "- Extract $FILES/bin.zip"
	unzip -o $FILES/bin.zip -d $base/bin
	printlog "- Extract $FILES/litegapps.zip"
	unzip -o $FILES/litegapps.zip -d $base/core/litegapps/
	printlog "- Extract $FILES/litegapps++.zip"
	unzip -o $FILES/litegapps++.zip -d $base/core/litegapps++/
	fi
#
exit 0
fi
for W in $base/bin/arm $base/core/litegapps/gapps/arm64 $base/core/litegapps++/gapps/croos_system; do
	if [ ! -d $W ]; then
	printlog "bin or gapps files not found. please restore !"
	printlog "usage : sh make restore"
	exit 1
	fi
done
#################################################
#Clean TMP
#################################################
[ ! -d $tmp ] && cdir $tmp
#################################################
#Remove placeholder file
#################################################
RM_PLACEHOLDER="
$base/core/litegapps/gapps
$base/core/litegapps++/gapps
"
for W in $RM_PLACEHOLDER; do
	if [ -f $W/placeholder ]; then
		printlog "- Removing file <$W/placeholder>"
		del $W/placeholder
	fi
done
#################################################
#Litegapps
#################################################
if [ $(get_config litegapps.build) = true ]; then
printlog " "
printlog "- Creating Litegapps"
. $base/core/litegapps/make
fi


#################################################
#Litegapps++
#################################################
if [ $(get_config litegapps++.build) = true ]; then
printlog " "
printlog "- Creating Litegapps++"
. $base/core/litegapps++/make
fi

[ -d $tmp ] && del $tmp

#################################################
#Done
#################################################
