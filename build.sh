# Litegapps Core Script
#
# Copyright 2020 - 2024 The LiteGapps Project
#


print(){
	echo "$1"
	}
	
printlog(){
	print "$1"
	if [ "$1" != " " ]; then
	echo "$1 [$(date '+%d/%m/%Y %H:%M:%S')]" >> $log
	else
	print "$1" >> $log
	fi
	}
sedlog(){
	echo "[Processing]  $1 [$(date '+%d/%m/%Y %H:%M:%S')]" >> $log
	}
	
	
getp(){ grep "^$1" "$2" | head -n1 | cut -d = -f 2; }


printmid() {
  local CHAR=$(printf "$@" | sed 's|\\e[[0-9;]*m||g' | wc -m)
  local hfCOLUMN=$((COLUMNS/2))
  local hfCHAR=$((CHAR/2))
  local indent=$((hfCOLUMN-hfCHAR))
  echo "$(printf '%*s' "${indent}" '') $@"
}



setime(){
	if [ $1 = '-f' ] && [ "$2" ] && [ $3 -eq $3 ]; then
	   if [ -f "$2" ]; then
	      touch -ct $3 "$2" 2>/dev/null || echo "setime: bad '$3': Value too large for defined data type"
	   else
	      echo "setime: $2: Is not file"
	   fi
	elif [ $1 = '-r' ] && [ "$2" ] && [ $3 -eq $3 ]; then
	   if [ -d "$2" ]; then
	      find "$2" -print | while read filename; do
	      touch -ct $3 "$filename" 2>/dev/null || echo "setime: bad '$3': Value too large for defined data type"
	      done
	   else
	      echo "setime: $2: Is not directory"
	   fi
	elif [ $1 = '--version' ] || [ $1 = '-v' ]; then
	echo "setime v1.0 Copyright (C) 2020 wahyu kurniawan (wahyu6070)."
    elif [ $1 = '--help' ] || [ $1 = '-h' ]; then
    echo "usage : setime <options> <input> <datetime>"
    echo " "
    echo "example : setime -r /sdcard/download 202004081503"
    echo " "
    echo "options"
    echo "-f                    file"
    echo "-r                    change all directory and file"
    echo "-v, --version         version"
    echo "-h, --help            help"
    echo " "
    echo "setime v1.0 since 2020-04-09 Copyright (C) 2020 wahyu kurniawan (wahyu6070)."
    else
    echo "usage : setime --help"
    fi
}


del(){ rm -rf "$@"; }
cdir(){ mkdir -p "$@"; }

ch_con(){
chcon -h u:object_r:system_file:s0 "$1" || sedlog "Failed chcon $1"
}

	
abort(){
	print " " | tee -a $log | tee -a $loglive
	print " !!! $1" | tee -a $log | tee -a $loglive
	print " " | tee -a $log | tee -a $loglive
	[ -d $tmp ] && del $tmp
	exit 1
	}
get_config() {
	getp "$1" "$base/config"
}

ERROR(){
	printlog "[ERROR] <$1>"
	[ -d $tmp ] && del $tmp
	exit 1
	}
BIN_TEST(){
	local INPUT=$1
	if [ "$(command -v $INPUT)" ]; then
		print "$(command -v $INPUT)"
	elif [ -f $bin/$INPUT ]; then
		print "$bin/$INPUT"
	else
		abort "Executable binary nor found <$INPUT>"
	fi
	}
lgapps_unzip(){
	printlog "- Unzip"
	local UNZIP=`BIN_TEST unzip`
	printlog "- Using executable <$UNZIP>"
	find $tmp -name *app -type d | while read DIRAPP; do
	for WAHYU1 in $(ls -1 $DIRAPP); do
		if [ -d $DIRAPP/$WAHYU1 ]; then
			if [ -f $DIRAPP/${WAHYU1}/${WAHYU1}.apk ]; then
				sedlog "Unzipping <<$DIRAPP/${WAHYU1}/${WAHYU1}.apk>>"
				sedlog "To <<$DIRAPP/${WAHYU1}/${WAHYU1}>>"
				test ! -d $DIRAPP/${WAHYU1}/${WAHYU1} && cdir $DIRAPP/${WAHYU1}/${WAHYU1}
				$UNZIP -o $DIRAPP/${WAHYU1}/${WAHYU1}.apk -d $DIRAPP/${WAHYU1}/${WAHYU1} >/dev/null
				if [ -f $DIRAPP/${WAHYU1}/${WAHYU1}.apk ]; then
					sedlog "- Deleting $DIRAPP/${WAHYU1}/${WAHYU1}.apk"
					del $DIRAPP/${WAHYU1}/${WAHYU1}.apk
				fi
				
			fi
		fi
	done
	done
	}

make_tar(){
	print "- Make tar apk"
	local input=$1
	local output=$2
	local TAR=`BIN_TEST tar`
	printlog "- Using executable <$TAR>"
	find $tmp -type d | while read folname; do
	local DIR_INPUT=`basename $folname`
	local G7
	for G7 in system product system_ext vendor; do
		if [ $DIR_INPUT = $G7 ]; then
			for i1 in $(ls -1 $folname); do
				if [ -d $folname/$i1 ]; then
					for i2 in $(ls -1 $folname/$i1); do
						cd $folname/$i1
						sedlog "- Creating .tar $folname/$i1/$i2"
						$TAR -cf $i2.tar $i2
						del $i2
						cd /
        			done
        		fi
        	done
    	fi
	done
	done
}
make_tar_arch(){
	printlog "- Make files.tar"
	cd $tmp
	local TAR=`BIN_TEST tar`
	printlog "- Using executable <$TAR>"
	$TAR -cf "files.tar" *
	
	cd /
	
	for RM_LIST_TMP in $(ls -1 $tmp); do
		if [ -d $tmp/$RM_LIST_TMP ]; then
    		sedlog "- Removing $tmp/$RM_LIST_TMP"
    		del $tmp/$RM_LIST_TMP
    	fi
	done
}
make_archive(){
	compression=$(get_config compression)
	lvlcom=$(get_config compression.level)
	printlog "- Building archive : $compression"
	printlog "- Level Compression : $lvlcom"
	cd $tmp
	for archi in $(ls -1 $tmp); do
		case $compression in
		xz)
		if [ $lvlcom -lt 10 ]; then
       	local XZ=`BIN_TEST xz`
       	printlog "- Using executable <$XZ>"
       	$XZ -${lvlcom}e $tmp/$archi
       	del $archi
        else
        	abort "xz level 1-9"
        fi
        ;;
      br | brotli)
        if [ $lvlcom -lt 10 ]; then
        	local BROTLI=`BIN_TEST brotli`
        	printlog "- Using executable <$BROTLI>"
        	$BROTLI -${lvlcom}j $archi
        	del $archi
       else
       	 abort "brotli level 1-9"
       fi
       ;;
     *)
       ERROR "Format $compression Not support"
       ;;
     esac
done

}
set_time_stamp(){
	local input=$1
	if [ $PROP_SET_TIME = true ] && [ $PROP_SET_DATE -eq $PROP_SET_DATE ]; then
		setime -r $input $PROP_SET_DATE
	fi
}
make_zip(){
	local INPUT="$1"
	local OUTPUT="$2"
	local ZIP_LEVEL=`get_config zip.level`
	case $ZIP_LEVEL in
	0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) ZIP_LEVEL=$ZIP_LEVEL ;;
	*) ZIP_LEVEL=1 ;;
	esac
	#checking binary
	if [ $(command -v zip) ]; then
		local ZIP=`command -v zip`
	elif [ -f $bin/zip ]; then
		local ZIP=$bin/zip
	else
		ERROR "Zip executable not found"
	fi
	cd $INPUT
	test ! -d $(dirname $OUTPUT) && cdir $(dirname $OUTPUT)
	test -f $OUTPUT && del $OUTPUT
	#
	printlog "- Build Zip"
	$ZIP -r${ZIP_LEVEL} $OUTPUT . >/dev/null
	
	if [ $(get_config zip.signer) = "true" ]; then
		#cheking java
		if [ "$(command -v java)" ];then
			printlog "- Zip signer"
			printlog "- Using java <$(command -v java)>"
			java -jar $base/bin/zipsigner.jar $OUTPUT ${OUTPUT}_signed
			if [ $? -eq 0 ]; then
				del $OUTPUT
				mv ${OUTPUT}_signed $OUTPUT
			else
				ERROR "Zip signer <$OUTPUT>"
			fi
		else
			ERROR "Java not installed"
		fi
	
	fi
	printlog " "
	printlog " Exec   : $ZIP"
	printlog " Name   : $(basename $OUTPUT)"
	printlog " Level  : $ZIP_LEVEL"
	printlog " Size   : $(du -sh $OUTPUT | cut -f1)"
	printlog " Output : $OUTPUT"
	printlog "- Done "
	printlog " "
	}
copy_binary_flashable(){
	local INPUT_ARCH=$1
	local CP_OUT=$2
	case $(get_config compression) in
     xz)
       local flashable_bin=xz
     ;;
      br | brotli)
       local flashable_bin=brotli
     ;;
     
     *) local flashable_bin=brotli
     ;;
     esac
	local input_arch=$1
	for W94 in tar zip $flashable_bin; do
		if [ -f $base/bin/$INPUT_ARCH/$W94 ]; then
			cdir $CP_OUT
			cp -pf $base/bin/$INPUT_ARCH/$W94 $CP_OUT/
		else
			ERROR "Binary <$base/bin/$INPUT_ARCH/$W94> not found"
		fi
	done
}
get_android_version(){
	local input=$1
	case $input in
		21) echo 5.0 ;;
		22) echo 5.1 ;;
		23) echo 6.0 ;;
		24) echo 7.0 ;;
		25) echo 7.1 ;;
		26) echo 8.0 ;;
		27) echo 8.1 ;;
		28) echo 9.0 ;;
		29) echo 10.0 ;;
		30) echo 11.0 ;;
		31) echo 12.0 ;;
		32) echo 12.1 ;;
		33) echo 13.0 ;;
		34) echo 14.0 ;;
		35) echo 15.0 ;;
	 esac
	}
	
SED(){
	local INPUT=$1
	local OUTPUT=$2
	local FILE=$3
	sed -i 's/'"${INPUT}"'/'"${OUTPUT}"'/g' $FILE
	}
	



base="`dirname $(readlink -f "$0")`"
chmod -R 755 $base/bin

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

export tmp=$base/tmp
export bin=$base/bin/$ARCH
export log=$base/log/make.log
export loglive=$base/log/make_live.log
export out=$base/output


PROP_VERSION=`get_config version`
PROP_VERSIONCODE=`get_config version.code`
PROP_CODENAME=`get_config codename`
PROP_BUILDER=`get_config name.builder`
PROP_SET_TIME=`get_config set.time.stamp`
PROP_SET_DATE=`get_config date.time`
PROP_COMPRESSION=`get_config compression`
PROP_COMPRESSION_LEVEL=`get_config compression.level`


if [ $2 = $2 ]; then
PRODUCT=$2
fi

if [ $3 = $3 ]; then
VARIANT=$3
fi

if [ $4 = $4 ]; then
ARCH_IN=$4
fi

if [ $5 = $5 ]; then
SDK_IN=$5
fi


case $(get_config build.status) in
	6070 | wahyu6070 | litegapps) 
		PROP_STATUS=official ;;
	*) 
		PROP_STATUS=unofficial ;;
esac


#process tmp
for P_TMP in $base/log $tmp; do
	[ -d $P_TMP ] && del $P_TMP && cdir $P_TMP || cdir $P_TMP
done

#################################################
#Cleaning dir
#################################################
CLEAN(){
	list_fol="
	$base/output
	$base/etc/extractor/input
	$base/etc/extractor/bin
	$base/etc/extractor/output
	$base/log
	$base/tmp_files
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
	for i in lite core go micro pixel nano pico basic user; do
	if [ -f $base/core/litegapps/$i/clean.sh ]; then
		BASED=$base/core/litegapps/$i
		chmod 755 $base/core/litegapps/$i/clean.sh
		. $base/core/litegapps/$i/clean.sh
	fi
	done
	for i in reguler lts microg; do
		if [ -f $base/core/litegappsx/$i/clean.sh ]; then
			BASED=$base/core/litegappsx/$i
			chmod 755 $base/core/litegappsx/$i/clean.sh
			. $base/core/litegappsx/$i/clean.sh
		fi
	done
	
	LIST_BIN="
	$base/bin/arm
	$base/bin/arm64
	$base/bin/x86
	$base/bin/x86_64
	$base/bin/zipsigner.jar
	"
	for W2 in $LIST_BIN; do
		if [ -d $W2 ] || [ -f $W2 ]; then
			print "- Cleaning <$W>"
			del $W2
		fi
	done
	[ -d $tmp ] && del $tmp
	print "- Cleaning Done"
}


#################################################
# Upload
#################################################
UPLOAD(){
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
		#del $SC
		#rmdir $(dirname $SC) 2>/dev/null
		echo
	fi
	done
	find * -type f -name *RECOVERY* | while read INPUT_OUT; do
	SC=$INPUT_OUT
	TG=/home/frs/project/litegapps/$SC
	printlog "- Uploading <$SC> to <$TG>"
	scp $SC $USERNAME@web.sourceforge.net:$TG
	done
	find * -type f -name *AUTO* | while read INPUT_OUT; do
	SC=$INPUT_OUT
	TG=/home/frs/project/litegapps/$SC
	printlog "- Uploading <$SC> to <$TG>"
	scp $SC $USERNAME@web.sourceforge.net:$TG
	done
	
}
#################################################
# Restore
#################################################
RESTORE(){
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
       curl --progress-bar -L -o $base/files/bin.zip https://sourceforge.net/projects/litegapps/files/files-server/bin/bin.zip/download
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
			if [ -f $base/core/litegapps/restore.sh ]; then
				BASED=$base/core/litegapps/$i
				chmod 755 $base/core/litegapps/restore.sh
				. $base/core/litegapps/restore.sh
			else
				printlog "! [SKIP] <$base/core/litegapps/restore.sh> Not found"
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
	
}

#################################################
# Make
#################################################
MAKE(){
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
	if [ "$PRODUCT" = "litegapps" ] || [ "$(get_config litegapps.build)" = "true" ]; then
		if [ $VARIANT ]; then
		LIST_LITEGAPPS=$VARIANT
		else
		LIST_LITEGAPPS=`get_config litegapps.type | sed "s/,/ /g"`
		fi
		
		for i in $LIST_LITEGAPPS; do
		export VARIANT=$i
			if [ -f $base/core/litegapps/make.sh ]; then
				BASED=$base/core/litegapps/$i
				chmod 755 $base/core/litegapps/make.sh
				. $base/core/litegapps/make.sh
			else
		 		ERROR "[ERROR] <$base/core/litegapps/make.sh> not found"
			fi
		done
	fi
	#################################################
	#Litegappsx
	#################################################
	if [ $(get_config litegappsx.build) = true ]; then
		LIST_LITEGAPPS_PLUS=`get_config litegappsx.type | sed "s/,/ /g"`
		for w in $LIST_LITEGAPPS_PLUS; do
			if [ -f $base/core/litegappsx/make.sh ]; then
				BASED=$base/core/litegappsx/$w
				chmod 755 $base/core/litegappx/make.sh
				. $base/core/litegappsx/make.sh
			else
				ERROR "[ERROR] <$base/core/litegappsx/make.sh> not found"
			fi
		done
	fi
	#################################################
	#Done
	#################################################
	del $tmp
}

#################################################
# Set Package litegapps variant
#################################################
SET_PACKAGE(){
	
	
	
	
	
	
	
	
	
	
	echo
	}
UPDATE_GAPPS_SERVER(){
	printlog "        Update Gapps Server"
	printlog " "
	#litegapps
	local BASE_GAPPS=$base/core/litegapps/lite/gapps
	for A in $(ls -1 $BASE_GAPPS); do
		for B in $(ls -1 $BASE_GAPPS/$A); do
			if [ -d $BASE_GAPPS/$A/$B/system ]; then
				printlog "- Zipping $BASE_GAPPS/$A/$B/system"
				cd $BASE_GAPPS/$A/$B
				del $tmp/files-server/litegapps/$A/$B
				cdir $tmp/files-server/litegapps/$A/$B
				zip -r9 $tmp/files-server/litegapps/$A/$B/$B.zip * >/dev/null
			fi
		done
	done
	printlog "- Upload to server"
	printlog " "
	for W in sftp scp; do
		if $(command -v $W >/dev/null); then
		printlog "Executable <$W> <$(command -v $W)> [OK]"
		else
		printlog "Executable <$W> [ERROR] not found"
		exit 1
		fi
	done
	printlog " "
	printlog "- Total Size file upload : $(du -sh $out)"
	printlog "- Server : Sourceforge"
	printlog "- Username account sourceforge"
	echo -n "- User name = "
	read USERNAME
	cd $tmp
	for C in $(find * -name *.zip -type f); do
		SC=$C
		TG=/home/frs/project/litegapps/$SC
		printlog "- Uploading <$SC> to <$TG>"
		scp $SC $USERNAME@web.sourceforge.net:$TG
	done
	printlog " "
	printlog "- done"
	}
case $1 in
restore | r)
RESTORE
;;
make | m)
MAKE
;;
clean | c)
CLEAN
;;
upload | u)
UPLOAD
;;
set-package)
SET_PACKAGE
;;
update-gapps-server)
UPDATE_GAPPS_SERVER
;;
*)
print "usage : bash make <options>"
print " "
print "Options"
print "restore              restoring files"
print "make                 build litegapps"
print "clean                cleaning all files"
print "upload               upload files output"
print "set-package          set package varian litegapps"
print "update-gapps-server  update files server gapps"
print " "
print " "
;;
esac

test -d $tmp && del $tmp
