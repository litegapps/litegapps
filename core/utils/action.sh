#!/system/bin/sh
#LiteGapps Action.sh
#by The LiteGapps Open Source Project


API=`getprop ro.build.version.sdk`

#Functions
print() { echo "$1"; }
GETPROP(){ grep "^$1" "$2" | head -n1 | cut -d = -f 2; }
getp(){ echo $1 "$2" | head -n1 | cut -d = -f 2; }
getp1(){ echo $1 | head -n1 | cut -d : -f 2; }
del(){ rm -rf "$@" ; }
cdir(){ mkdir -p "$@" ; }
error() {
	print
	print "${RED}ERROR :  ${WHITE}$1${GREEN}"
	print
	}
printmid() {
  local CHAR=$(printf "$@" | sed 's|\\e[[0-9;]*m||g' | wc -m)
  local hfCOLUMN=$((COLUMNS/2))
  local hfCHAR=$((CHAR/2))
  local indent=$((hfCOLUMN-hfCHAR))
  echo "$(printf '%*s' "${indent}" '') $@"
}
loadings() {
  PID=$!
  a=0;
  while [ -d /proc/$PID ]; do
    b=$((+1))
    a=$((a+1))
    sleep 0.9s
    printf "\r${@} [${a}Second]"
  done
}
print_title(){
	clear
	printmid "${YELLOW}$1${GREEN}"
	print " "
	}

spinner() {
  set +x
  PID=$!
  h=0; anim='-\|/';
  while [ -d /proc/$PID ]; do
    h=$(((h+1)%4))
    sleep 0.02
    printf "\r${@} [${anim:$h:1}]"
  done
  set -x 2>>$VERLOG
}
end_menu(){
	print " "
	print "${YELLOW}1. Back"
	print " "
	echo -n "${VIOLET} Select Menu : ${CYAN}"
	read lol
	}
SELECT(){
	print
	echo -n "${YELLOW}Choose one of the numbers : ${CYAN}"
	read PILIH
	}
print_true(){
	print "${GREEN}${1} = ${GREEN}${2}${GREEN}"
	}
print_false(){
	print "${GREEN}${1} = ${WHITE}${2}${GREEN}"
	}
app_true(){
	
	pm list packages | grep -q $1
	if [ $? -eq "0" ]; then
	return 0
	else
	return 1
	fi
	
	}
OPEN_LINK(){
	local ads_link=$1
	
	if $(app_true com.android.chrome); then
	am start -n com.android.chrome/com.google.android.apps.chrome.Main -a android.intent.action.VIEW -d $ads_link
	elif $(app_true com.chrome.canary); then
	am start -n com.chrome.canary/com.google.android.apps.chrome.Main -a android.intent.action.VIEW -d $ads_link
	elif $(app_true com.chrome.beta); then
	am start -n com.chrome.beta/com.google.android.apps.chrome.Main -a android.intent.action.VIEW -d $ads_link
	elif $(app_true com.chrome.dev); then
	am start -n com.chrome.dev/com.google.android.apps.chrome.Main -a android.intent.action.VIEW -d $ads_link
	else
	am start -a android.intent.action.VIEW -d $ads_link
	fi
	}
REBOOT(){
	touch $DATA/reboot
	
	}
	
	
	
	
app_check(){
	local package=$1
	if pm list packages | grep -q $package; then
	print "[√] Package Is Installed"
	local PATH98=`pm list packages -f $package | head -n1 | cut -d : -f 2`
	print "[√] Path : $PATH98"
	file "$PATH98"
	else
	print "[!] Package is not found"
	fi
	
	
	} 
get_android_version(){
	local input=$1
	case $input in
		21) echo 5.0 ;;
		22) echo 5.1 ;;
		23) echo 6.0 ;;
		24) echo 7.0 ;;
		25) echo 7.1 ;;
		26) echo 8.0 ;;
		27) echo 8.1 ;;
		28) echo 9.0 ;;
		29) echo 10.0 ;;
		30) echo 11.0 ;;
		31) echo 12.0 ;;
		32) echo 12.1 ;;
		33) echo 13.0 ;;
		34) echo 14.0 ;;
		35) echo 15.0 ;;
	 esac
	}
	
printmid "LiteGapps Action"
print " "
print "- Checking if gapps has been installed correctly"

print "--------------------"
print "- Checking Google Play Services"
for s1 in /system/priv-app /system/product /system/system_ext; do
	if [ -f $s1/priv-app/GmsCore/GmsCore.apk ]; then
		app1=$s1/priv-app/GmsCore/GmsCore.apk
		break
	fi
done
package=com.google.android.gms

if pm list packages | grep -q $package && [ -f $app1 ]; then
PATH98=$app1
PATHDATA=`pm list packages -f $package | head -n1 | sed 's/package://g' | sed "s/=$package//g"`
print "[√] Package Is Installed"

FILE=$PATH98

PERMISSIONS=$(stat -c "%a" "$FILE")

if [ "$PERMISSIONS" -eq 644 ]; then
    echo "[√] Permissions file"
else
    echo "[X] Permissions is not 644, permissions file: $PERMISSIONS"
fi

if ls -Z $PATH98 | grep -q u:object_r:system_file:s0 ; then
	echo "[√] Permissions selinux"
else
	echo "[X] Permissions selinux"
fi
print "[√] Path system : $PATH98"
print "[√] Path app : $PATHDATA"
version=`pm dump $package | grep versionName | head -n1 | cut -d = -f 2`
print "[√] Version app : $version"
minsdk=`pm dump $package | grep minSdk | head -n1 | awk -F'minSdk=' '{print $2}' | awk '{print $1}'`
print "[√] Min Support : Android $(get_android_version $minsdk)"
maxsdk=`pm dump $package | grep targetSdk | head -n1 | awk -F'targetSdk=' '{print $2}' | awk '{print $1}'`
print "[√] Max Support : Android $(get_android_version $maxsdk)"

else
print "[!] Google Play Services Package is not found"
fi

print "--------------------"
print "- Checking Google Store"

for s1 in /system/priv-app /system/product /system/system_ext; do
	if [ -f $s1/priv-app/Phonesky/Phonesky.apk ]; then
		app1=$s1/priv-app/Phonesky/Phonesky.apk
		break
	fi
done
package=com.android.vending

if pm list packages | grep -q $package && [ -f $app1 ]; then
PATH98=$app1
PATHDATA=`pm list packages -f $package | head -n1 | sed 's/package://g' | sed "s/=$package//g"`
print "[√] Package Is Installed"

FILE=$PATH98

PERMISSIONS=$(stat -c "%a" "$FILE")

if [ "$PERMISSIONS" -eq 644 ]; then
    echo "[√] Permissions file"
else
    echo "[X] Permissions is not 644, permissions file: $PERMISSIONS"
fi

if ls -Z $PATH98 | grep -q u:object_r:system_file:s0 ; then
	echo "[√] Permissions selinux"
else
	echo "[X] Permissions selinux"
fi
print "[√] Path system : $PATH98"
print "[√] Path app : $PATHDATA"
version=`pm dump $package | grep versionName | head -n1 | cut -d = -f 2`
print "[√] Version app : $version"
minsdk=`pm dump $package | grep minSdk | head -n1 | awk -F'minSdk=' '{print $2}' | awk '{print $1}'`
print "[√] Min Support : Android $(get_android_version $minsdk)"
maxsdk=`pm dump $package | grep targetSdk | head -n1 | awk -F'targetSdk=' '{print $2}' | awk '{print $1}'`
print "[√] Max Support : Android $(get_android_version $maxsdk)"

else
print "[!] Google Play Store Package is not found"
fi

print "--------------------"
print "- Checking Google Services Framework"

for s1 in /system/priv-app /system/product /system/system_ext; do
	if [ -f $s1/priv-app/Phonesky/Phonesky.apk ]; then
		app1=$s1/priv-app/Phonesky/Phonesky.apk
		break
	fi
done
package=com.google.android.gsf

if pm list packages | grep -q $package && [ -f $app1 ]; then
PATH98=$app1
PATHDATA=`pm list packages -f $package | head -n1 | sed 's/package://g' | sed "s/=$package//g"`
print "[√] Package Is Installed"

FILE=$PATH98

PERMISSIONS=$(stat -c "%a" "$FILE")

if [ "$PERMISSIONS" -eq 644 ]; then
    echo "[√] Permissions file"
else
    echo "[X] Permissions is not 644, permissions file: $PERMISSIONS"
fi

if ls -Z $PATH98 | grep -q u:object_r:system_file:s0 ; then
	echo "[√] Permissions selinux"
else
	echo "[X] Permissions selinux"
fi
print "[√] Path system : $PATH98"
print "[√] Path app : $PATHDATA"
version=`pm dump $package | grep versionName | head -n1 | cut -d = -f 2`
print "[√] Version app : $version"
minsdk=`pm dump $package | grep minSdk | head -n1 | awk -F'minSdk=' '{print $2}' | awk '{print $1}'`
print "[√] Min Support : Android $(get_android_version $minsdk)"
maxsdk=`pm dump $package | grep targetSdk | head -n1 | awk -F'targetSdk=' '{print $2}' | awk '{print $1}'`
print "[√] Max Support : Android $(get_android_version $maxsdk)"

else
print "[!] Google Services Framework Package is not found"
fi


print "--------------------"
print "- Done"