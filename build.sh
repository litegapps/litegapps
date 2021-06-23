# Litegapps Core Script
#
#
base="`dirname $(readlink -f "$0")`"
chmod -R 755 $base/bin
. $base/bin/core-functions
#actived bash function colos
bash_color
#
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
	$base/core/litegapps_pixel/gapps
	$base/etc/extractor/input
	$base/etc/extractor/output
	$base/log
	"
	if [ -f $base/files/bin.zip ] && [ $base/core/litegapps/files/arm64/30/30.zip ] && [ $base/core/litegapps++/files/sdk.zip ]; then
		print "!!! files <bin.zip> <litegapps.zip> <litegapps++.zip> found"
		print " do you want to removing files ?"
		echo -n " yes/no : "
		read filesrm
		case $filesrm in
		y | Y | yes | YES)
		print "- Removing files"
		LIST_FILES="
		$base/files
		$base/core/litegapps/files
		$base/core/litegapps++/files
		$base/core/litegapps_pixel/files
		"
		for WAH in $LIST_FILES; do
		print "Cleaning $WAH"
		del $WAH
		cdir $WAH
		touch $WAH/placeholder
		done
		;;
		*)
		print "Skipping removing files"
		;;
		esac
	else
		print "- Removing files"
		del $base/files
		cdir $base/files
		touch $base/files/placeholder
	fi
	for W in $list_fol
	do
	 if [ -d $W ]; then
	 	print "Cleaning $W"
	 	del $W
	 	cdir $W
	 	touch $W/placeholder
	 fi
	done
	for W2 in $base/bin/arm $base/bin/x86; do
		if [ -d $W2 ]; then
			print "cleaning $W"
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
	[ $? ] && del $SC && rmdir $(dirname $SC) 2>/dev/null
	done
	find * -type f -name *RECOVERY* | while read INPUT_OUT; do
	SC=$INPUT_OUT
	TG=/home/frs/project/litegapps/$SC
	printlog "- Uploading <$SC> to <$TG>"
	scp $SC $USERNAME@web.sourceforge.net:$TG
	[ $? ] && del $SC && rmdir $(dirname $SC) 2>/dev/null
	done
	find * -type f -name *AUTO* | while read INPUT_OUT; do
	SC=$INPUT_OUT
	TG=/home/frs/project/litegapps/$SC
	printlog "- Uploading <$SC> to <$TG>"
	scp $SC $USERNAME@web.sourceforge.net:$TG
	[ $? ] && del $SC && rmdir $(dirname $SC) 2>/dev/null
	done
	exit 0
fi
#################################################
# Restore
#################################################
if [ "$1" = restore ]; then
	clear
	[ ! -d $base/files ] && cdir $base/files
	printlog "               Restoring Files"
	printlog " "
	printlog "- Checking executable"
	for W in curl unzip; do
		if $(command -v $W >/dev/null); then
			printlog "Executable <$W> <$(command -v $W)> [OK]"
		else
			printlog "Executable <$W> [ERROR] not found"
		exit 1
		fi
	done
	
	printlog " "
	if [ -f $base/files/bin.zip ]; then
		printlog "1. Available : bin.zip"
		printlog "    Size zip : $(du -sh $base/files/bin.zip | cut -f1)"
		unzip -o $base/files/bin.zip -d $base/bin >/dev/null 2>&1
		if [ $? -eq 0 ]; then
		printlog "    Extract status : Successful"
		else
		printlog "    Extract status : Failed"
		printlog "    REMOVING FILES"
		del $base/files/bin.zip
		exit 1
		fi
	else
		printlog "1. Downloading : bin.zip"
       curl -L -o $base/files/bin.zip https://sourceforge.net/projects/litegapps/files/files-server/bin/bin.zip >/dev/null 2>&1
       if [  $? -eq 0 ]; then
       	printlog "     Downloading status : Successful"
       	printlog "     File size : $(du -sh $base/files/bin.zip | cut -f1)"
       else
       	printlog "     Downloading status : Failed"
       	printlog "     ! PLEASE CEK YOUR INTERNET CONNECTION AND RESTORE AGAIN"
       	del $base/files/bin.zip
       	exit 1
       fi
       unzip -o $base/files/bin.zip -d $base/bin >/dev/null 2>&1
       if [ $? -eq 0 ]; then
       	printlog "     Unzip : $base/files/bin.zip"
       	printlog "     unzip status : Successful"
       else
       	printlog "     Unzip : $base/files/bin.zip"
       	printlog "     unzip status : Failed"
       	printlog "     REMOVING FILES"
       	del $base/files/bin.zip
       	exit 1
       fi
	fi
	for W in $(ls $base/core); do
		if [ -d $base/core/$W ]; then
			if [ -f $base/core/$W/restore ]; then
				chmod 755 $base/core/$W/restore
				. $base/core/$W/restore
			fi
		fi
	
	done
#
exit 0
fi
for W in $base/bin/arm $base/core/litegapps/gapps/arm64 $base/core/litegapps++/gapps/cross_system; do
	if [ ! -d $W ]; then
	printlog "bin or gapps files not found. please restore !"
	printlog "usage : sh make restore"
	exit 1
	fi
done

#################################################
#Remove placeholder file
#################################################
RM_PLACEHOLDER="
$base/core/litegapps/gapps
$base/core/litegapps++/gapps
$base/core/litegapps_pixel/gapps
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
printlog "- Buulding Litegapps"
[ ! -d $tmp ] && cdir $tmp || del $tmp && cdir $tmp
. $base/core/litegapps/make
fi


#################################################
#Litegapps++
#################################################
if [ $(get_config litegapps++.build) = true ]; then
printlog " "
printlog "- Building Litegapps++"
[ ! -d $tmp ] && cdir $tmp || del $tmp && cdir $tmp
. $base/core/litegapps++/make
fi
#################################################
#Litegapps pixel
#################################################
if [ $(get_config litegapps.pixel.build) = true ]; then
printlog " "
printlog "- Building Litegapps"
[ ! -d $tmp ] && cdir $tmp || del $tmp && cdir $tmp
. $base/core/litegapps_pixel/make
fi
[ -d $tmp ] && del $tmp

#################################################
#Done
#################################################
