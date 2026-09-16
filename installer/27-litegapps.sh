#!/sbin/sh
# Copyright 2020 - 2026 The Litegapps Project
# 27-litegapps.sh - keep a LiteGapps "kopi" (system) install across ROM updates
# ADDOND_VERSION=3
#
# Run by the ROM's backuptool - backuptool.sh from recovery, backuptool_ab.sh
# during an A/B OTA - once per stage, each time as its own process. Nothing
# here may rely on a variable set in another stage.
#
# The backuptool contract this script follows:
#   $S   the system root. Files are always addressed through it: $S/...,
#        $S/product/..., $S/system_ext/... For ADDOND_VERSION 3 backuptool
#        mounts vendor/product/system_ext so those symlinks resolve, both in
#        recovery and on A/B devices.
#   $C   the backup directory, kept from the backup stage to the restore stage.
#   backup_file, restore_file and get_output_path (backuptool.functions): on
#        A/B they send a $S/... path to the new slot under /postinstall, so
#        every write below goes through them rather than to $S directly.

# Keep this line exactly as it is: backuptool_ab.sh rewrites it to its own path.
. /tmp/backuptool.functions

[ -n "$S" ] || S=/system            # run by hand, outside backuptool
[ -n "$C" ] || C=/tmp/backupdir

# Copy of the kopi module record, taken at backup and read back at restore.
# It lives in $C because /tmp does not exist in Android during an A/B OTA.
base="$C/litegapps-kopi"
module="$base/module.prop"

ps | grep zygote | grep -v grep >/dev/null && BOOTMODE=true || BOOTMODE=false
$BOOTMODE || ps -A 2>/dev/null | grep zygote | grep -v grep >/dev/null && BOOTMODE=true

if ! $BOOTMODE; then
	# update-binary|updater <RECOVERY_API_VERSION> <OUTFD> <ZIPFILE>
	OUTFD=$(ps | grep -v 'grep' | grep -oE 'update(.*) 3 [0-9]+' | cut -d" " -f3)
	[ -z "$OUTFD" ] && OUTFD=$(ps -Af | grep -v 'grep' | grep -oE 'update(.*) 3 [0-9]+' | cut -d" " -f3)
	# update_engine_sideload --payload=file://<ZIPFILE> --offset=<OFFSET> --headers=<HEADERS> --status_fd=<OUTFD>
	[ -z "$OUTFD" ] && OUTFD=$(ps | grep -v 'grep' | grep -oE 'status_fd=[0-9]+' | cut -d= -f2)
	[ -z "$OUTFD" ] && OUTFD=$(ps -Af | grep -v 'grep' | grep -oE 'status_fd=[0-9]+' | cut -d= -f2)
fi

ui_print(){
	if $BOOTMODE; then
		log -t LiteGapps -- "$1"
	elif [ -n "$OUTFD" ]; then
		echo -e "ui_print $1\nui_print" >> /proc/self/fd/$OUTFD
	else
		echo "$1"
	fi
}

print(){ ui_print "$1"; }

getp(){ [ -f "$2" ] && grep "^$1=" "$2" | head -n1 | cut -d = -f 2-; }

# Where a $S/... path lands in the ROM being installed (the new slot on A/B).
out(){ get_output_path "$1"; }

# set_prop <key> <value> <file>: the key is matched whole, not as a regex
# fragment, so "setupwizard.theme" never rewrites "ro.setupwizard.theme".
set_prop(){
	local key="$1" value="$2" file="$3" esc
	[ -f "$file" ] || return 0
	esc=$(printf '%s' "$key" | sed 's/[][\.*^$/]/\\&/g')
	if grep -q "^${esc}=" "$file"; then
		sed -i "s/^${esc}=.*/${key}=${value}/" "$file"
	else
		echo "${key}=${value}" >> "$file"
	fi
}

# Every path the Kopi installer recorded, addressed through $S. The lists are
# relative to their partition root and mix files with directories.
installed_paths(){
	local part root f
	for part in system product system_ext vendor; do
		case $part in
			system) root="$S" ;;
			*) root="$S/$part" ;;
		esac
		[ -f "$base/list_install_$part" ] || continue
		while IFS= read -r f; do
			[ -n "$f" ] && echo "$root/$f"
		done < "$base/list_install_$part"
	done
}

# Debloat entries were recorded as the device's absolute paths at install
# time (/mnt/system/system/app/X, /product/priv-app/Y, ...), which differ
# between recoveries. Re-root them under $S by partition.
debloat_target(){
	local e="$1" dir name
	case "$e" in
		*/priv-app/*) dir=priv-app ;;
		*/app/*) dir=app ;;
		*) return 1 ;;
	esac
	name="${e##*/$dir/}"
	case "$e" in
		*/product/$dir/*) echo "$S/product/$dir/$name" ;;
		*/system_ext/$dir/*) echo "$S/system_ext/$dir/$name" ;;
		*) echo "$S/$dir/$name" ;;
	esac
}

case "$1" in
	pre-backup)
		print "LiteGapps addon.d (system $S, backup $C)"
	;;
	backup)
		if [ ! -d "$S/etc/kopi/modules/litegapps" ]; then
			print "! LiteGapps is not installed in $S - nothing to keep"
			exit 0
		fi
		print "- Backing up LiteGapps"
		rm -rf "$base"
		mkdir -p "$base"
		cp -rdf "$S/etc/kopi/modules/litegapps/." "$base/"

		installed_paths | while IFS= read -r F; do
			if [ -f "$F" ] && [ ! -L "$F" ]; then
				backup_file "$F"
			fi
		done
	;;
	post-backup)
		# Stub
	;;
	pre-restore)
		# Stub
	;;
	restore)
		if [ ! -f "$module" ]; then
			print "! No LiteGapps backup in $C - skipping restore"
			exit 0
		fi
		print "- Restoring $(getp name "$module") $(getp version "$module")"

		# Only what the backup stage actually saved: the lists also name
		# directories, which restore_file cannot copy.
		installed_paths | while IFS= read -r F; do
			if [ -f "$C/$F" ] || [ -L "$C/$F" ]; then
				restore_file "$F"
			fi
		done

		# The kopi module record, so LiteGapps is still managed after the update.
		KOPI_OUT="$(out "$S/etc/kopi/modules/litegapps")"
		rm -rf "$KOPI_OUT"
		mkdir -p "$KOPI_OUT"
		cp -rdf "$base/." "$KOPI_OUT/"

		if [ "$(getp litegapps_variant "$module")" != lite ]; then
			print "- Patching build.prop for Setup Wizard"
			PROP_FILE="$(out "$S/build.prop")"
			set_prop "setupwizard.feature.baseline_setupwizard_enabled" "true" "$PROP_FILE"
			set_prop "ro.setupwizard.enterprise_mode" "1" "$PROP_FILE"
			set_prop "ro.setupwizard.rotation_locked" "true" "$PROP_FILE"
			set_prop "setupwizard.enable_assist_gesture_training" "true" "$PROP_FILE"
			set_prop "setupwizard.feature.skip_button_use_mobile_data.carrier1839" "true" "$PROP_FILE"
			set_prop "setupwizard.feature.show_pai_screen_in_main_flow.carrier1839" "false" "$PROP_FILE"
			set_prop "setupwizard.feature.show_pixel_tos" "false" "$PROP_FILE"
			set_prop "ro.setupwizard.network_required" "false" "$PROP_FILE"
			# product's build.prop moved to etc/ in Android 10
			for P in "$S/product/etc/build.prop" "$S/product/build.prop"; do
				P="$(out "$P")"
				if [ -f "$P" ]; then
					set_prop "setupwizard.theme" "glif_v3_light" "$P"
					break
				fi
			done
		fi

		# The ROM brought back what LiteGapps removed at install time.
		if [ -f "$base/list-debloat" ]; then
			while IFS= read -r E; do
				T="$(debloat_target "$E")" || continue
				T="$(out "$T")"
				if [ -e "$T" ]; then
					print "- Removing $T"
					rm -rf "$T"
				fi
			done < "$base/list-debloat"
		fi
	;;
	post-restore)
		print "- LiteGapps $(getp litegapps_variant "$module") restored"
		rm -rf "$base"
	;;
esac

exit 0
