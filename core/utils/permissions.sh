# Copyright 2020 - 2025 The Litegapps Project
# permissions.sh
# latest update 04-01-2025


for T in $SYSTEM $PRODUCT $SYSTEM_EXT; do
	if [ -d $T ] && [ "$(ls -A $T)" ]; then
	ls -alZR $T > $LITEGAPPS/log/$(basename ${T}).new
	else
	sedlog "! <$T> not found"
	fi

done
make_log
