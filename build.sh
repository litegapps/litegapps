# Litegapps Core Script
#
#
base="`dirname $(readlink -f "$0")`"
chmod -R 775 $base/bin
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
#Updating
#################################################
if [ "$1" = update ]; then
	printmid "Litegapps Updates"
	print
	print "-Updating kopi installer"


exit 0
fi
#################################################
#Cleaning dir
#################################################
if [ "$1" = clean ]; then
	flashable=$base/flashable
	print "- Cleaning"
	if [ -d $base/output ]; then
		del $base/output
		cdir $base/output
		touch $base/output/placefolder
	fi
	
	
	if [ -d $base/log ]; then
		del $base/log
		cdir $base/log
		touch $base/log/placefolder
	fi
	
	if [ -d $base/tmp ]; then
		del $base/tmp
	fi
	for G in $(ls -1 $base/flashable); do
		if [ -d $base/flashable/$G/files ]; then
			del $base/flashable/$G/files
			cdir $base/flashable/$G/files
			touch $base/flashable/$G/files/placefolder
		fi
	done
	
	for F in $(ls -1 $base/litegapps++/flashable); do
		if [ -d $base/litegapps++/flashable/$F/files ]; then
			del $base/litegapps++/flashable/$F/files
			cdir $base/litegapps++/flashable/$F/files
			touch $base/litegapps++/flashable/$F/files/placefolder
			##
		fi
	done
	print "- Cleaning Done"
	exit 0
fi

#################################################
# Git update repository
#################################################

if [ "$1" = push ]; then
	print "- Update repository github"
	if [ ! -d $base/.git ]; then
	print "- Cleating Git init"
	git init
	fi
	cd $base
	git commit -m "improvement •> $(date)"
	if [ ! "$(grep https://github.com/Wahyu6070/litegapps.git $base/.git/config)" ]; then
	print "- git remote add origin"
	git remote add origin https://github.com/Wahyu6070/litegapps.git
	fi
	print "- git push" && git push -u origin master
	print "- Git push done"
	exit 0
fi

#################################################
#Clean TMP
#################################################
[ ! -d $tmp ] && cdir $tmp
#################################################
#Litegapps
#################################################
del $tmp
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

del $tmp

#################################################
#Done
#################################################
