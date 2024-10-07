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


ch_con(){
chcon -h u:object_r:system_file:s0 "$1" || sedlog "Failed chcon $1"
}


# osm0sis : https://github.com/osm0sis/AnyKernel3
[ -d /postinstall/tmp ] && POSTINSTALL=/postinstall;
[ "$ANDROID_ROOT" ] || ANDROID_ROOT=/system;


file_getprop() {  grep "^$2=" "$1" |  cut -d= -f2-; }
find_slot() {
  local slot=$(getprop ro.boot.slot_suffix 2>/dev/null);
  [ "$slot" ] || slot=$( grep -o 'androidboot.slot_suffix=.*$' /proc/cmdline |  cut -d\  -f1 |  cut -d= -f2);
  if [ ! "$slot" ]; then
    slot=$(getprop ro.boot.slot 2>/dev/null);
    [ "$slot" ] || slot=$( grep -o 'androidboot.slot=.*$' /proc/cmdline |  cut -d\  -f1 |  cut -d= -f2);
    [ "$slot" ] && slot=_$slot;
  fi;
  [ "$slot" ] && echo "$slot";
}
setup_mountpoint() {
  [ -L $1 ] &&  mv -f $1 ${1}_link;
  if [ ! -d $1 ]; then
     rm -f $1;
     mkdir -p $1;
  fi;
}
is_mounted() {  mount |  grep -q " $1 "; }
mount_apex() {
  [ -d /system_root/system/apex ] || return 1;
  local apex dest loop minorx num var;
  setup_mountpoint /apex;
   mount -t tmpfs tmpfs /apex -o mode=755 &&  touch /apex/apextmp;
  minorx=1;
  [ -e /dev/block/loop1 ] && minorx=$( ls -l /dev/block/loop1 |  awk '{ print $6 }');
  num=0;
  for apex in /system_root/system/apex/*; do
    dest=/apex/$( basename $apex .apex);
    case $dest in
      *.current|*.release) dest=$(echo $dest |  rev |  cut -d. -f2- |  rev);;
    esac;
     mkdir -p $dest;
    case $apex in
      *.apex)
         unzip -qo $apex apex_payload.img -d /apex;
         mv -f /apex/apex_payload.img $dest.img;
         mount -t ext4 -o ro,noatime $dest.img $dest 2>/dev/null;
        if [ $? != 0 ]; then
          while [ $num -lt 64 ]; do
            loop=/dev/block/loop$num;
            [ -e $loop ] ||  mknod $loop b 7 $((num * minorx));
             losetup $loop $dest.img 2>/dev/null;
            num=$((num + 1));
             losetup $loop |  grep -q $dest.img && break;
          done;
           mount -t ext4 -o ro,loop,noatime $loop $dest;
          if [ $? != 0 ]; then
             losetup -d $loop 2>/dev/null;
          fi;
        fi;
      ;;
      *)  mount -o bind $apex $dest;;
    esac;
  done;
  for var in $( grep -o 'export .* /.*' /system_root/init.environ.rc |  awk '{ print $2 }'); do
    eval OLD_${var}=\$$var;
  done;
  $( grep -o 'export .* /.*' /system_root/init.environ.rc |  sed 's; /;=/;'); unset export;
}
umount_apex() {
  [ -d /apex ] || return 1;
  local dest loop var;
  for var in $( grep -o 'export .* /.*' /system_root/init.environ.rc 2>/dev/null |  awk '{ print $2 }'); do
    if [ "$(eval echo \$OLD_$var)" ]; then
      eval $var=\$OLD_${var};
    else
      eval unset $var;
    fi;
    unset OLD_${var};
  done;
  for dest in $( find /apex -type d -mindepth 1 -maxdepth 1); do
    loop=$( mount |  grep $dest |  grep loop |  cut -d\  -f1);
     umount -l $dest;
    [ "$loop" ] &&  losetup -d $loop;
  done;
  [ -f /apex/apextmp ] &&  umount /apex;
   rm -rf /apex 2>/dev/null;
}
mount_all() {
  local byname mount slot system;
  if ! is_mounted /cache; then
     mount /cache 2>/dev/null && UMOUNT_CACHE=1;
  fi;
  if ! is_mounted /data; then
     mount /data && UMOUNT_DATA=1;
  fi;
  (for mount in /vendor /product /system_ext /persist; do
     mount -o ro -t auto $mount;
  done) 2>/dev/null;
  setup_mountpoint $ANDROID_ROOT;
  if ! is_mounted $ANDROID_ROOT; then
     mount -o ro -t auto $ANDROID_ROOT 2>/dev/null;
  fi;
  byname=bootdevice/by-name;
  [ -d /dev/block/$byname ] || byname=$( find /dev/block/platform -type d -name by-name 2>/dev/null |  head -n1 |  cut -d/ -f4-);
  [ -d /dev/block/mapper ] && byname=mapper;
  [ -e /dev/block/$byname/system ] || slot=$(find_slot);
  case $ANDROID_ROOT in
    /system_root) setup_mountpoint /system;;
    /system)
      if ! is_mounted /system && ! is_mounted /system_root; then
        setup_mountpoint /system_root;
         mount -o ro -t auto /system_root;
      elif [ -f /system/system/build.prop ]; then
        setup_mountpoint /system_root;
         mount --move /system /system_root;
      fi;
      if [ $? != 0 ]; then
        ( umount /system;
         umount -l /system) 2>/dev/null;
         mount -o ro -t auto /dev/block/$byname/system$slot /system_root;
      fi;
    ;;
  esac;
  [ -f /system_root/system/build.prop ] && system=/system;
  for mount in /vendor /product /system_ext; do
    if ! is_mounted $mount && [ -L /system$mount -o -L /system_root$system$mount ]; then
      setup_mountpoint $mount;
       mount -o ro -t auto /dev/block/$byname$mount$slot $mount;
    fi;
  done;
  if is_mounted /system_root; then
    mount_apex;
    #mount -o bind /system_root$system /system;
  fi;
  if ! is_mounted /persist && [ -e /dev/block/bootdevice/by-name/persist ]; then
    setup_mountpoint /persist;
     mount -o ro -t auto /dev/block/bootdevice/by-name/persist /persist;
  fi;
  
  #if [ -d /dev/block/mapper ]; then
    #for block in system vendor product system_ext; do
      #for slot in "" _a _b; do
        #blockdev --setrw /dev/block/mapper/$block$slot 2>/dev/null
      #done
    #done
  #fi
}
umount_all() {
  local mount;
  (if [ ! -d /postinstall/tmp ]; then
     umount /system;
     umount -l /system;
  fi) 2>/dev/null;
  umount_apex;
  (if [ ! -d /postinstall/tmp ]; then
     umount /system_root;
     umount -l /system_root;
  fi;
  umount /vendor; # busybox umount /vendor breaks recovery on some hacky devices
  umount -l /vendor;
  for mount in /mnt/system /mnt/vendor /product /mnt/product /system_ext /mnt/system_ext /persist; do
     umount $mount;
     umount -l $mount;
  done;
  if [ "$UMOUNT_DATA" ]; then
     umount /data;
     umount -l /data;
  fi;
  if [ "$UMOUNT_CACHE" ]; then
     umount /cache;
     umount -l /cache;
  fi) 2>/dev/null;
}
setup_env() {
  $BOOTMODE && return 1;
   mount -o bind /dev/urandom /dev/random;
  if [ -L /etc ]; then
    setup_mountpoint /etc;
     cp -af /etc_link/* /etc;
     sed -i 's; / ; /system_root ;' /etc/fstab;
  fi;
  umount_all;
  mount_all;
  OLD_LD_PATH=$LD_LIBRARY_PATH;
  OLD_LD_PRE=$LD_PRELOAD;
  OLD_LD_CFG=$LD_CONFIG_FILE;
  unset LD_LIBRARY_PATH LD_PRELOAD LD_CONFIG_FILE;
  if [ ! "$(getprop 2>/dev/null)" ]; then
    getprop() {
      local propdir propfile propval;
      for propdir in / /system_root /system /vendor /product /system_ext /odm; do
        for propfile in default.prop build.prop; do
          if [ "$propval" ]; then
            break 2;
          else
            propval="$(file_getprop $propdir/$propfile $1 2>/dev/null)";
          fi;
        done;
      done;
      if [ "$propval" ]; then
        echo "$propval";
      else
        echo "";
      fi;
    }
  elif [ ! "$(getprop ro.build.type 2>/dev/null)" ]; then
    getprop() {
      ($(which getprop) |  grep "$1" |  cut -d[ -f3 |  cut -d] -f1) 2>/dev/null;
    }
  fi;
}
restore_env() {
  $BOOTMODE && return 1;
  local dir;
  unset -f getprop;
  [ "$OLD_LD_PATH" ] && export LD_LIBRARY_PATH=$OLD_LD_PATH;
  [ "$OLD_LD_PRE" ] && export LD_PRELOAD=$OLD_LD_PRE;
  [ "$OLD_LD_CFG" ] && export LD_CONFIG_FILE=$OLD_LD_CFG;
  unset OLD_LD_PATH OLD_LD_PRE OLD_LD_CFG;
  umount_all;
  [ -L /etc_link ] &&  rm -rf /etc/*;
  (for dir in /etc /apex /system_root /system /vendor /product /system_ext /persist; do
    if [ -L "${dir}_link" ]; then
      rmdir $dir;
       mv -f ${dir}_link $dir;
    fi;
  done;
   umount -l /dev/random) 2>/dev/null;
}
DIR_PARTITION(){
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

	}
MOUNT2(){
	setenforce 0
	setup_env
	DIR_PARTITION
	for W78 in /system /product /system_ext /system_root /vendor; do
		if is_mounted $W78; then
			mount -o rw,remount -t auto $W78 2>/dev/null || print "! Failed mounting R/W <$W78>"
		fi
	done
}

UMOUNT2(){
	setenforce 0
	restore_env
	}

COPY_FILE() {
  cp -dp "$1" "$2"
  [ ! -f $1 ] && print "! Not Found Input $1"
  [ ! -f $2 ] && print "! Not found Output $2"
  # symlinks don't have a context
  if [ ! -L "$1" ]; then
    # it is assumed that every label starts with 'u:object_r' and has no white-spaces
    local context=`ls -Z "$1" | grep -o 'u:object_r:[^ ]*' | head -1`
    chcon "$context" "$2"
  fi
}

BACKUP_FILE() {
  if [ -e "$1" -o -L "$1" ]; then
    local F=`basename "$1"`
    local D=`dirname "$1"`
    # dont backup any apps that have odex files, they are useless
    if ( echo "$F" | grep -q "\.apk$" ) && [ -e `echo "$1" | sed -e 's/\.apk$/\.odex/'` ]; then
      echo "Skipping odexed apk $1";
    else
      mkdir -p "$TMP$D"
      COPY_FILE "$1" "$TMP$D/$F"
    fi
  fi
}

RESTORE_FILE() {
  local FILE=`basename "$1"`
  local DIR=`dirname "$1"`
  if [ -e "$TMP$DIR/$FILE" -o -L "$TMP$DIR/$FILE" ]; then
    if [ ! -d "$DIR" ]; then
      mkdir -p "$DIR";
    fi
    COPY_FILE "$TMP$DIR/$FILE" "$1";
    if [ -n "$2" ]; then
      echo "Deleting obsolete file $2"
      rm "$2";
    fi
  fi
}


LIST_DIR="
$TMP
"
for Y in $LIST_DIR; do
	[ ! -d $Y ] && mkdir -p $Y
done

case "$1" in
  backup)
  	MOUNT2
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
	  UMOUNT2
  ;;
  restore)
  	MOUNT2
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
      
      ## Removing files
      if [ -f $base/list-debloat ]; then
      	for YT in $(cat $base/list-debloat); do
      		if [ -f "$YT" ]; then
      			print "- Removing $YT"
      			rm -rf "$YT"
      		fi
      	done
      else
      print "! <$base/list-debloat> is not found"
      fi
  	UMOUNT2
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
    NAME=`getp name $module`
    VARIANT=`getp litegapps_variant $module`
    VERSION=`getp version $module`
    
    print "Variant : $VARIANT"
	print "Restoring $NAME $VERSION Finish"
	
	
	rm -rf /$base
  ;;
esac

