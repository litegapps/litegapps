#!/system/bin/sh
base="$(dirname "$(readlink -f $0)")"
chmod -R 775 $base/bin
case $(uname -m) in
*x86*) ARCH32=x86 ;;
*) ARCH32=arm ;;
esac
bin=$base/bin/$ARCH32
chmod 775 $base/build.sh
if [ -f $bin/bash ]; then
$bin/bash $base/build.sh $@
elif $(command -v bash >/dev/null); then
bash $base/build.sh $@
elif $(command -v sh >/dev/null); then
sh $base/build.sh $@
fi