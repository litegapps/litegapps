#!/usr/bin/env bash
#################################################
# web/clear-output.sh
#
# Free the build tree: delete the zips in output/ and the build logs in log/.
# Sources (bin/, gapps, packages/files) are left alone - `build.sh clean` is
# the one that throws those away too.
#
# usage: bash web/clear-output.sh
#
# Anything in output/ that was never released is gone for good, so the panel
# asks before running this, and the job lock keeps it away from a live build.
#
# Copyright 2020 - 2026 The LiteGapps Project
#################################################
set -u
BASED="$(dirname "$(dirname "$(readlink -f "$0")")")"

size_of(){ [ -d "$1" ] && du -sh "$1" 2>/dev/null | cut -f1 || echo 0; }

echo "==================================================="
echo " Clearing build output and logs"
echo " Tree : $BASED"
echo "==================================================="

for D in output log packages/output; do
	T="$BASED/$D"
	if [ -d "$T" ]; then
		echo "- Removing <$D> ($(size_of "$T"))"
		rm -rf "${T:?}" || echo "! could not remove <$D>"
	else
		echo "- <$D> is already gone"
	fi
done

echo " "
echo "- Done. Sources under bin/, core/*/gapps and packages/files were kept."
