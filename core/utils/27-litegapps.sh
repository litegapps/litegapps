#!/sbin/sh
# Copyright 2020 - 2025 The Litegapps Project
# Litegapps addon.d (running in rom installer)
# ADDOND_VERSION=3
# by wahyu6070

base=/tmp/kopi/modules/litegapps
module=$base/module.prop

. /tmp/backuptool.functions

if [ "$C" ]; then
	TMP=$C
else
	TMP=/tmp/backupdir
fi

ps | grep zygote | grep -v grep >/dev/null && BOOTMODE=true || BOOTMODE=false
$BOOTMODE || ps -A 2>/dev/null | grep zygote | grep -v grep >/dev/null && BOOTMODE=true

if ! $BOOTMODE; then
# update-binary|updater <RECOVERY_API_VERSION> <OUTFD> <ZIPFILE>
 OUTFD=$(ps | grep -v 'grep' | grep -oE 'update(.*) 3 [0-9]+' | cut -d" " -f3)
 [ -z $OUTFD ] && OUTFD=$(ps -Af | grep -v 'grep' | grep -oE 'update(.*) 3 [0-9]+' | cut -d" " -f3)
 # update_engine_sideload --payload=file://<ZIPFILE> --offset=<OFFSET> --headers=<HEADERS> --status_fd=<OUTFD>
 [ -z $OUTFD ] && OUTFD=$(ps | grep -v 'grep' | grep -oE 'status_fd=[0-9]+' | cut -d= -f2)
 [ -z $OUTFD ] && OUTFD=$(ps -Af | grep -v 'grep' | grep -oE 'status_fd=[0-9]+' | cut -d= -f2)
 fi
 ui_print() { $BOOTMODE && log -t Magisk -- "$1" || echo -e "ui_print $1\nui_print" >> /proc/self/fd/$OUTFD; }

print(){
	ui_print "$1"
	}
	
#

getp(){ grep "^$1" "$2" | head -n1 | cut -d = -f 2; }


set_prop() {
  local property="$1"
  local value="$2"
  file_location="$3"
  if grep -q "${property}" "${file_location}"; then
    sed -i "s/\(${property}\)=.*/\1=${value}/g" "${file_location}"
  else
    echo "${property}=${value}" >>"${file_location}"
  fi
}

ch_con(){
chcon -h u:object_r:system_file:s0 "$1" || sedlog "Failed chcon $1"
}


SYSTEM="$S"


NAME=`getp name $module`
VARIANT=`getp litegapps_variant $module`
VERSION=`getp version $module`


LIST_DIR="
$TMP
"
for Y in $LIST_DIR; do
	[ ! -d $Y ] && mkdir -p $Y
done

case "$1" in
  backup)
  	
  	if [ -d $SYSTEM/etc/kopi ]; then
  		#print "- Copying $SYSTEM/etc/kopi"
  		rm -rf /tmp/kopi
  		mkdir -p /tmp/kopi
  		cp -rdf $SYSTEM/etc/kopi/* /tmp/kopi/
  	else
  		print "! Failed Backup $SYSTEM/etc/kopi"
  		return 0
  	fi
  	
  	print "Backuping LiteGapps"
  	
  	## Backup 27-litegapps.sh
  	cp -f $SYSTEM/addon.d/27-litegapps.sh $base/
  	
  	if [ -f $base/list_install_system ]; then
  	
  		for AAA in $(cat $base/list_install_system); do
  			if [ -f $SYSTEM/$AAA ] && [ ! -L $SYSTEM/$AAA ] ; then
  				#print "  Backuping •> $SYSTEM/$AAA"
  				backup_file $SYSTEM/$AAA
  			fi
    	  done
 	 fi
 	 if [ -f $base/list_install_product ]; then
 	 	for BBB in $(cat $base/list_install_product); do
 	 		if [ -f $PRODUCT/$BBB ] && [ ! -L $PRODUCT/$BBB ] ; then
 	 			#print "  Backuping •> $PRODUCT/$BBB"
 	 			backup_file $PRODUCT/$BBB
    		  fi
    	  done
  	fi
  	if [ -f $base/list_install_system_ext ]; then
  		for CCC in $(cat $base/list_install_system_ext); do
  			if [ -f $SYSTEM_EXT/$CCC ] && [ ! -L $SYSTEM_EXT/$CCC ] ; then
  				#print "  Backuping •> $SYSTEM_EXT/$CCC"
  				backup_file $SYSTEM_EXT/$CCC
    		  fi
    	  done
	  fi
	  
  ;;
  restore)
  	
  	if [ ! -d $base ]; then
  		print "! Failed Restore LiteGapps"
  		return 0
  	fi
  	print "Restoring LiteGapps"
  	if [ -f $base/list_install_system ]; then
  		for A in $(cat $base/list_install_system); do
  			if [ -f $TMP$SYSTEM/$A ] && [ ! -L $TMP$SYSTEM/$A ]; then
  				dir1=`dirname $SYSTEM/$A`
  				#print "  Restoring •> $SYSTEM/$A"
  				restore_file $SYSTEM/$A
  				ch_con $dir1
  			fi
    	  done
  	fi
  	if [ -f $base/list_install_product ]; then
  		for B in $(cat $base/list_install_product); do
  			if [ -f $TMP$PRODUCT/$B ] && [ ! -L $TMP$PRODUCT/$B ]; then
  				dir1=`dirname $PRODUCT/$B`
  				#print "  Restoring •> $PRODUCT/$B"
  				restore_file $PRODUCT/$B
  				ch_con $dir1
  			fi
    	  done
  	fi
  	if [ -f $base/list_install_system_ext ]; then
  		for CCCC in $(cat $base/list_install_system_ext); do
  			if [ -f $TMP$SYSTEM_EXT/$CCCC ] && [ ! -L $TMP$SYSTEM_EXT/$CCCC ]; then
  				dir1=`dirname $SYSTEM_EXT/$CCCC`
  				#print "  Restoring •> $SYSTEM_EXT/$CCCC"
  				restore_file $SYSTEM_EXT/$CCCC
  				ch_con $dir1
  			fi
    	  done
  	fi
  	
  	rm -rf $SYSTEM/etc/kopi/modules/litegapps
      mkdir -p $SYSTEM/etc/kopi/modules/litegapps
      cp -rdf $base/* $SYSTEM/etc/kopi/modules/litegapps/
  	
      ## litegapps addon.d
      cp -f $base/27-litegapps.sh $SYSTEM/addon.d
      chmod 755 $SYSTEM/addon.d/27-litegapps.sh
      
      if [ $VARIANT != lite ]; then
      	print "- Patch Build.prop Config"
      	PROP_FILE=$SYSTEM/build.prop
		  sedlog "- Backuping $PROP_FILE TO $DIR_BACKUP/build.prop"
		  cp -pf $PROP_FILE $DIR_BACKUP/build.prop
		  set_prop "setupwizard.feature.baseline_setupwizard_enabled" "true" "$PROP_FILE"
		  set_prop "ro.setupwizard.enterprise_mode" "1" "$PROP_FILE"
		  set_prop "ro.setupwizard.rotation_locked" "true" "$PROP_FILE"
		  set_prop "setupwizard.enable_assist_gesture_training" "true" "$PROP_FILE"
		  set_prop "setupwizard.theme" "glif_v3_light" "$SYSTEM/product/build.prop"
		  set_prop "setupwizard.feature.skip_button_use_mobile_data.carrier1839" "true" "$PROP_FILE"
		  set_prop "setupwizard.feature.show_pai_screen_in_main_flow.carrier1839" "false" "$PROP_FILE"
		  set_prop "setupwizard.feature.show_pixel_tos" "false" "$PROP_FILE"
		  set_prop "ro.setupwizard.network_required" "false" "$PROP_FILE"
      
      fi
      
      ## Removing files
      if [ -f $base/list-debloat ]; then
      	for YT in $(cat $base/list-debloat); do
      		if [ -f "$YT" ]; then
      			print "- Removing File <${YT}>"
      			rm -rf "$YT"
      		elif [ -d "$YT" ]; then
      			print "- Removing Directory <${YT}>"
      			rm -rf "$YT"
      		fi
      	done
      else
      print "[!] <$base/list-debloat> is not found"
      fi
  	
    ;;
  pre-backup)
  	DIR_PARTITION
  	echo " "
  	echo "Addon Version : $V"
  	echo "Tmp : $TMP"
  	echo "LiteGapps Addon.d"
  	echo "Started -> $(date '+%d/%m/%Y %H:%M:%S')"
  	echo "System = $SYSTEM"
  	echo " "
  ;;
  post-backup)
    # Stub
  ;;
  pre-restore)
    # Stub
    print "Litegapps addon.d $V"
    ;;
  post-restore)
  
    print "Variant : $VARIANT"
	print "Restoring $NAME $VERSION Finish"
	rm -rf /$base
  ;;
esac

