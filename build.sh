# Litegapps Core Script
#
# copyright 2020 - 2021 litegapps

base="`dirname $(readlink -f "$0")`"
chmod -R 755 $base/bin
. $base/bin/core-functions
#actived bash function colos
bash_color
#
case $(uname -m) in
aarch32 | armv7l) ARCH=arm
;;
aarch64 | armv8l) ARCH=arm64
;;
i386 | i486 |i586 | i686) ARCH=x86
;;
*x86_64*) ARCH=x86_64
;;
*) ERROR "Architecure not support <$(uname -m)>"
;;
esac

tmp=$base/tmp
bin=$base/bin/$ARCH
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

case $(get_config build.status) in
	6070 | wahyu6070 | litegapps) 
		PROP_STATUS=official ;;
	*) 
		PROP_STATUS=unofficial ;;
esac

case "$(get_config apk.compress.type)" in
litegapps_compress)
apk_compessed_type=litegapps_compress
;;
litegapps_default)
apk_compessed_type=litegapps_default
;;
*)
apk_compessed_type=litegapps_default
;;
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
	$base/etc/extractor/input
	$base/etc/extractor/bin
	$base/etc/extractor/output
	$base/log
	"
	if [ -f $base/files/bin.zip ]; then
		print "!!! files <bin.zip> found"
		print " do you want to removing files ?"
		echo -n " yes/no : "
		read filesrm
		case $filesrm in
		y | Y | yes | YES)
		print "- Removing files"
		del $base/files
		cdir $base/files
		touch $base/files/placeholder
		;;
		*)
		print "- Skipping removing files"
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
	 	print "- Cleaning <$W>"
	 	del $W
	 	cdir $W
	 	touch $W/placeholder
	 fi
	done
	for i in lite bakso core go micro pixel; do
	if [ -f $base/core/litegapps/$i/clean.sh ]; then
		BASED=$base/core/litegapps/$i
		chmod 755 $base/core/litegapps/$i/clean.sh
		. $base/core/litegapps/$i/clean.sh
	fi
	done
	for i in reguler lts microg; do
		if [ -f $base/core/litegapps++/$i/clean.sh ]; then
			BASED=$base/core/litegapps++/$i
			chmod 755 $base/core/litegapps++/$i/clean.sh
			. $base/core/litegapps++/$i/clean.sh
		fi
	done
	
	LIST_BIN="
	$base/bin/arm
	$base/bin/arm64
	$base/bin/x86
	$base/bin/x86_64
	"
	for W2 in $LIST_BIN; do
		if [ -d $W2 ]; then
			print "- Cleaning <$W>"
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
	if [ $? -eq 0 ]; then
		del $SC
		rmdir $(dirname $SC) 2>/dev/null
	fi
	done
	find * -type f -name *RECOVERY* | while read INPUT_OUT; do
	SC=$INPUT_OUT
	TG=/home/frs/project/litegapps/$SC
	printlog "- Uploading <$SC> to <$TG>"
	scp $SC $USERNAME@web.sourceforge.net:$TG
	[ $? -eq 0 ] && del $SC && rmdir $(dirname $SC) 2>/dev/null
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
       curl -L -o $base/files/bin.zip https://gitlab.com/litegapps/litegapps-server/-/raw/main/bin/bin.zip >/dev/null 2>&1
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
	if [ $(get_config litegapps.build) = true ]; then
		for i in $(get_config litegapps.restore | sed "s/,/ /g"); do
			if [ -f $base/core/litegapps/$i/restore.sh ]; then
				BASED=$base/core/litegapps/$i
				chmod 755 $base/core/litegapps/$i/restore.sh
				. $base/core/litegapps/$i/restore.sh
			else
				printlog "! [SKIP] <$base/core/litegapps/$i/restore.sh> Not found"
			fi
		done
	fi
	if [ $(get_config litegapps++.build) = true ]; then
		for i in $(get_config litegapps++.restore | sed "s/,/ /g"); do
			if [ -f $base/core/litegapps++/$i/restore.sh ]; then
				BASED=$base/core/litegapps++/$i
				chmod 755 $base/core/litegapps++/$i/restore.sh
				. $base/core/litegapps++/$i/restore.sh
			else
				printlog "! [SKIP] <$base/core/litegapps++/$i/restore.sh> Not found"
			fi
		done
	fi
	
#
exit 0
fi
for W in $base/bin/arm; do
	if [ ! -d $W ]; then
	printlog "bin or gapps files not found. please restore !"
	printlog "usage : sh make restore"
	exit 1
	fi
done

#################################################
#Remove placeholder file
#################################################
RM_PLACEHOLDER=`find $base -name place_holder -type f`
for W in $RM_PLACEHOLDER; do
	if [ -f $W ]; then
		printlog "- Removing file <$W>"
		del $W
	fi
done

#################################################
#Litegapps
#################################################
if [ $(get_config litegapps.build) = true ]; then
	LIST_LITEGAPPS=`get_config litegapps.type | sed "s/,/ /g"`
	for i in $LIST_LITEGAPPS; do
		if [ -f $base/core/litegapps/$i/make.sh ]; then
			BASED=$base/core/litegapps/$i
			chmod 755 $base/core/litegapps/$i/make.sh
			. $base/core/litegapps/$i/make.sh
		else
		 	ERROR "[ERROR] <$base/core/litegapps/$i/make.sh> not found"
		fi
	done
fi
#################################################
#Litegapps++
#################################################
if [ $(get_config litegapps++.build) = true ]; then
	LIST_LITEGAPPS_PLUS=`get_config litegapps++.type | sed "s/,/ /g"`
	for w in $LIST_LITEGAPPS_PLUS; do
		if [ -f $base/core/litegapps++/$w/make.sh ]; then
			if [ -f $base/core/litegapps++/$w/make.sh ]; then
			BASED=$base/core/litegapps++/$w
			chmod 755 $base/core/litegapps++/$w/make.sh
			. $base/core/litegapps++/$w/make.sh
			fi
		else
			ERROR "[ERROR] <$base/core/litegapps++/$w/make.sh> not found"
		fi
	done
fi
#################################################
#Done
#################################################
