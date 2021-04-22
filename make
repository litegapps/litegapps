#!/system/bin/sh
base="$(dirname "$(readlink -f $0)")"
chmod -R 775 $base/bin
case $(uname -m) in
*x86*) ARCH32=x86 ;;
*) ARCH32=arm ;;
esac
bin=$base/bin/$ARCH32
chmod 775 $base/build.sh
$bin/bash $base/build.sh $@
