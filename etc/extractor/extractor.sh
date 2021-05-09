base="$(dirname "$(readlink -f $0)")"
case $(uname -m) in
*x86) ARCH32=x86 ;;
*) ARCH32=arm
esac
bin=$base/bin/$ARCH32
chmod -R 777 $bin
cd $base
[ ! -d $base/input ] && mkdir -p $base/input
[ -d $base/tmp ] && rm -rf $base/tmp && mkdir -p $base/tmp || mkdir -p $base/tmp
[ -d $base/output ] && rm -rf $base/output && mkdir -p $base/output || mkdir -p $base/output

for GAPPSNAME in $(ls -1 $base/input); do
	if [ -f $base/input/$GAPPSNAME ]; then
	clear
	echo " OpenGapps Detected"
	echo "- Extracting $GAPPSNAME"
	test ! -d $base/tmp/$GAPPSNAME && mkdir -p $base/tmp/$GAPPSNAME
	$bin/busybox unzip -o $base/input/$GAPPSNAME -d $base/tmp/$GAPPSNAME
		find $base/tmp/$GAPPSNAME -type f -name *.lz | while read LZNAME; do
		clear
		echo "- Extracting •> $(basename $LZNAME)"
		$bin/busybox tar -xf $LZNAME -C $(dirname $LZNAME)
			find $base/tmp/$GAPPSNAME -type d | while read PACKAGE_MOVE; do
				case $PACKAGE_MOVE in
					*nodpi/priv-app)
					OUTPUT=$base/output/$GAPPSNAME/nodpi/system/priv-app/
					test ! -d $OUTPUT && mkdir -p $OUTPUT
					echo "- Copying =•> $(basename $PACKAGE_MOVE)"
					cp -af $PACKAGE_MOVE/* $OUTPUT
					;;
					*nodpi/app)
					OUTPUT=$base/output/$GAPPSNAME/nodpi/system/app/
					test ! -d $OUTPUT && mkdir -p $OUTPUT
					echo "- Copying =•> $(basename $PACKAGE_MOVE)"
					cp -af $PACKAGE_MOVE/* $OUTPUT
					;;
					*common/etc)
					OUTPUT=$base/output/$GAPPSNAME/nodpi/system/etc/
					test ! -d $OUTPUT && mkdir -p $OUTPUT
					echo "- Copying =•> $(basename $PACKAGE_MOVE)"
					cp -af $PACKAGE_MOVE/* $OUTPUT
					;;
					*nodpi/etc)
					OUTPUT=$base/output/$GAPPSNAME/nodpi/system/etc/
					test ! -d $OUTPUT && mkdir -p $OUTPUT
					echo "- Copying =•> $(basename $PACKAGE_MOVE)"
					cp -af $PACKAGE_MOVE/* $OUTPUT
					;;
					*nodpi/framework)
					OUTPUT=$base/output/$GAPPSNAME/nodpi/system/framework/
					test ! -d $OUTPUT && mkdir -p $OUTPUT
					echo "- Copying =•> $(basename $PACKAGE_MOVE)"
					cp -af $PACKAGE_MOVE/* $OUTPUT
					;;
					*common/framework)
					OUTPUT=$base/output/$GAPPSNAME/nodpi/system/framework/
					test ! -d $OUTPUT && mkdir -p $OUTPUT
					echo "- Copying =•> $(basename $PACKAGE_MOVE)"
					cp -af $PACKAGE_MOVE/* $OUTPUT
					;;
					*nodpi/lib)
					OUTPUT=$base/output/$GAPPSNAME/nodpi/system/lib/
					test ! -d $OUTPUT && mkdir -p $OUTPUT
					echo "- Copying =•> $(basename $PACKAGE_MOVE)"
					cp -af $PACKAGE_MOVE/* $OUTPUT
					;;
					*common/lib)
					OUTPUT=$base/output/$GAPPSNAME/nodpi/system/lib/
					test ! -d $OUTPUT && mkdir -p $OUTPUT
					echo "- Copying =•> $(basename $PACKAGE_MOVE)"
					cp -af $PACKAGE_MOVE/* $OUTPUT
					;;
					*common/lib64)
					OUTPUT=$base/output/$GAPPSNAME/nodpi/system/lib/
					test ! -d $OUTPUT && mkdir -p $OUTPUT
					echo "- Copying =•> $(basename $PACKAGE_MOVE)"
					cp -af $PACKAGE_MOVE/* $OUTPUT
					;;
					*nodpi/lib64)
					OUTPUT=$base/output/$GAPPSNAME/nodpi/system/lib64/
					test ! -d $OUTPUT && mkdir -p $OUTPUT
					echo "- Copying =•> $(basename $PACKAGE_MOVE)"
					cp -af $PACKAGE_MOVE/* $OUTPUT
					;;
				esac
			done
		done
	else
	echo " $GAPPSNAME NOT SUPPORT FILE"
	fi
done
test -d $base/tmp && rm -rf $base/tmp
