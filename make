#!/system/bin/sh
base="$(dirname "$(readlink -f $0)")"
chmod -R 775 $base/bin
case $(uname -m) in
aarch32 | armv7l) ARCH=arm
;;
aarch64 | armv8l) ARCH=arm64
;;
i386 | i486 |i586 | i686) ARCH=x86
;;
*x86_64*) ARCH32=x86_64
;;
*) echo "Architecure not support <$(uname -m)>"
exit 1
;;
esac
bin=$base/bin/$ARCH
chmod 775 $base/build.sh

if $(command -v bash >/dev/null); then
bash $base/build.sh $@
elif $(command -v sh >/dev/null); then
sh $base/build.sh $@
elif [ -f $bin/bash ]; then
$bin/bash $base/build.sh $@
fi