#!/usr/bin/env bash
# Delete the restored build sources of one target (arch/sdk), mirroring
# cleanup_target() in vps-build.sh. Built zips under output/ are kept.
#
# usage: bash web/clean-sources.sh <arch> <sdk>
set -u

BASED="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
ARCH="${1:-}"
SDK="${2:-}"

case "$ARCH" in
	arm64 | arm | x86 | x86_64) ;;
	*) echo "! bad arch <$ARCH>"; exit 1 ;;
esac
case "$SDK" in
	2[4-9] | 3[0-7]) ;;
	*) echo "! bad sdk <$SDK>"; exit 1 ;;
esac

remove(){
	if [ -e "$1" ]; then
		echo "- Removing <${1#"$BASED"/}> ($(du -sh "$1" 2>/dev/null | cut -f1))"
		rm -rf "$1"
	fi
}

echo "Cleaning sources of <$ARCH/$SDK>"
remove "$BASED/packages/files/$ARCH/$SDK"
remove "$BASED/packages/zip-server/$ARCH/$SDK.zip"
remove "$BASED/tmp_files/gapps-src/$ARCH/$SDK"
remove "$BASED/tmp_files/litegapps/$ARCH/$SDK"
for v in lite core go micro pixel nano basic user superlite; do
	remove "$BASED/core/litegapps/$v/gapps/$ARCH/$SDK"
	remove "$BASED/core/litegapps/$v/files/$ARCH/$SDK"
	remove "$BASED/core/litegapps/$v/modules/$ARCH/$SDK"
done
echo "- done"
