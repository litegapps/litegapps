# Copyright 2020 - 2022 The Litegapps Project
# magisk uninstaller (running by magisk in android boot)

if [ -f /data/adb/service.d/litegapps-post-fs ]; then
	rm -rf /data/adb/service.d/litegapps-post-fs
fi
if [ -d /data/adb/litegapps ]; then
	rm -rf /data/adb/litegapps
fi

sleep 60s

LIST_PACKAGE="
com.google.android.gms
com.android.vending
com.google.android.calendar
com.google.android.gm
com.google.android.play.games
com.google.android.videos
com.google.android.apps.photos
com.google.android.apps.docs
"

for L in $LIST_PACKAGE; do
    pm uninstall $L
done

