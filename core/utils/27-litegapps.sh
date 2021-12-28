#!/sbin/sh
# Copyright 2020 - 2021 The Litegapps Project
# Litegapps addon.d (running in rom installer)
# by wahyu6070

. /tmp/backuptool.functions
log=/data/media/0/Android/litegapps/litegapps_addon.d.log
base=/data/kopi/modules/litegapps

test ! -d $(dirname $log) && mkdir -p $(dirname $log)
test -f $log && rm -rf $log

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
sedlog(){
	echo "[Processing]  $1 [$(date '+%d/%m/%Y %H:%M:%S')]" >> $log
	}
#
ch_con(){
chcon -h u:object_r:system_file:s0 "$1" || sedlog "Failed chcon $1"
}


if [ -f /system/system/build.prop ]; then
SYSTEM=/system/system
elif [ -f /system_root/system/build.prop ]; then
SYSTEM=/system_root/system
elif [ -f /system_root/build.prop ]; then
SYSTEM=/system_root
else
SYSTEM=/system
fi

if [ ! -L $SYSTEM/product ]; then
PRODUCT=$SYSTEM/product
else
PRODUCT=/product
fi

if [ ! -L $SYSTEM/system_ext ]; then
SYSTEM_EXT=$SYSTEM/system_ext
else
SYSTEM_EXT=/system_ext
fi

[ ! -d $base ] && return 0

# S = is variable in backup/restore script in rom flashable

case "$1" in
  backup)
  	print "Backuping LiteGapps"
  	if [ -f $base/list_install_system ]; then
  		for A in $(cat $base/list_install_system); do
  			if [ -f $S/$A ] && [ ! -L $S/$A ] ; then
  				sedlog "  Backuping •> $S/$A"
  				backup_file $S/$A
  			fi
    	  done
 	 fi
 	 if [ -f $base/list_install_product ]; then
 	 	for B in $(cat $base/list_install_product); do
 	 		if [ -f $PRODUCT/$B ] && [ ! -L $PRODUCT/$B ] ; then
 	 			sedlog "  Backuping •> $PRODUCT/$B"
 	 			backup_file $PRODUCT/$B
    		  fi
    	  done
  	fi
  	if [ -f $base/list_install_system_ext ]; then
  		for C in $(cat $base/list_install_system_ext); do
  			if [ -f $SYSTEM_EXT/$C ] && [ ! -L $SYSTEM_EXT/$C ] ; then
  				sedlog "  Backuping •> $SYSTEM_EXT/$C"
  				backup_file $SYSTEM_EXT/$C
    		  fi
    	  done
	  fi  
  ;;
  restore)
  	print "Restoring LiteGapps"
  	if [ -f $base/list_install_system ]; then
  		for A in $(cat $base/list_install_system); do
  			dir1=`dirname $S/$A`
  			sedlog "  Restoring •> $S/$A"
  			restore_file $S/$A
  			ch_con $dir1
    	  done
  	fi
  	if [ -f $base/list_install_product ]; then
  		for B in $(cat $base/list_install_product); do
  			dir1=`dirname $PRODUCT/$B`
  			sedlog "  Restoring •> $PRODUCT/$B"
  			restore_file $PRODUCT/$B
  			ch_con $dir1
    	  done
  	fi
  	if [ -f $base/list_install_system_ext ]; then
  		for C in $(cat $base/list_install_system_ext); do
  			dir1=`dirname $SYSTEM_EXT/$C`
  			sedlog "  Restoring •> $SYSTEM_EXT/$C"
  			restore_file $SYSTEM_EXT/$C
  			ch_con $dir1
    	  done
  	fi
    ;;
  pre-backup)
    echo " " >> $log
	echo "Litegapps Addon.d" >> $log
	echo "Started -> $(date '+%d/%m/%Y %H:%M:%S')" >> $log
	echo "System = $S" >> $log
	echo " " >> $log
  ;;
  post-backup)
    # Stub
  ;;
  pre-restore)
    # Stub
    print "Litegapps addon.d"
  ;;
  post-restore)
    echo " " >> $log
	echo "# $(date '+%d/%m/%Y %H:%M:%S')" >> $log
	echo "###########" >> $log
	echo "#   Done  #" >> $log
	echo "###########" >> $log
  ;;
esac
