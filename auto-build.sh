BASED="`dirname $(readlink -f "$0")`"

arch="
arm64

"
sdk="
34
"


CORE_MODULE () {
	local input=$1
	local output=$2
	local list="
GoogleServicesFramework
GmsCore                  
GoogleCalendarSyncAdapter
PlayStore
Phonesky
GoogleContactsSyncAdapter
"
for Y in $(ls -1 $input); do

 for G in $list; do
 skip=false
 if [ $Y = $G ]; then
 	skip=true
 	break
 fi
 done
 
 if ! $skip; then
 rm -rf $2/$Y
 mkdir -p $2/$Y
 echo "- Copying <$input/$Y> to <$output/$Y>"
 cp -rdf $1/$Y $2/
 else
 echo "- Skip $Y"
 fi
done
	}

	
	
	
PIXEL () {
	local variant=pixel
	#pixel
	local IN=$BASED/packages/output/$ARCH/$SDK/
	local OUT=$BASED/core/litegapps/pixel/modules/$ARCH/$SDK/
	rm -rf $OUT
	CORE_MODULE $BASED/packages/output/$ARCH/$SDK/core $BASED/core/litegapps/pixel/modules/$ARCH/$SDK/core
	cp -rdf $BASED/packages/output/$ARCH/$SDK/gapps $BASED/core/litegapps/pixel/modules/$ARCH/$SDK/
	bash $BASED/build.sh make litegapps $variant $ARCH $SDK
	[ ! -d $RELEASE/$variant ] && mkdir -p $RELEASE/$variant
	RIN=$BASED/output/litegapps/$ARCH/$SDK/$variant 
	ROUT=$RELEASE/$variant
	for U in $(ls -1 $RIN); do
	echo "- Release <$RIN/$U> to <$ROUT>"
	cp -rdf $RIN/$U $ROUT/
	rm -rf $RIN/$U
	done
	
	}
	
MICRO (){
	local variant=micro
	local list="
	AndroidAuto
Arcore
DeskClockGoogle
DevicePolicy
Chrome
DreamLiner
Files
Gmail
GoogleAssistant
GoogleCalculator
GoogleCalendar
GoogleContacts
GoogleDialer
GoogleKeyboard
GoogleTTS
LocationHistory
MarkupGoogle
Messaging
PixelLauncher
PixelLiveWallpaper
SoundPicker
Talkback
Turbo
Velvet
GoogleSearch
WallpaperPicker
Wellbeing
	"
	
	local IN=$BASED/packages/output/$ARCH/$SDK/
	local OUT=$BASED/core/litegapps/micro/modules/$ARCH/$SDK/
	rm -rf $OUT
	CORE_MODULE $BASED/packages/output/$ARCH/$SDK/core $BASED/core/litegapps/micro/modules/$ARCH/$SDK/core
	
	for M in $(ls -1 $BASED/packages/output/$ARCH/$SDK/gapps) ; do
	for M1 in $list; do
	local check=false
	if [ $M = $M1 ]; then
	local check=true
	break
	fi
	done
	
	if $check; then
	echo "+ Copying <$BASED/packages/output/$ARCH/$SDK/gapps/$M> To <$BASED/core/litegapps/micro/modules/$ARCH/$SDK/gapps/>"
	
	mkdir -p $BASED/core/litegapps/micro/modules/$ARCH/$SDK/gapps/$M
	cp -rdf $BASED/packages/output/$ARCH/$SDK/gapps/$M $BASED/core/litegapps/micro/modules/$ARCH/$SDK/gapps/
	else
	echo "! Skipping $M"
	fi
	done
	
	
	bash $BASED/build.sh make litegapps $variant $ARCH $SDK
	[ ! -d $RELEASE/$variant ] && mkdir -p $RELEASE/$variant
	RIN=$BASED/output/litegapps/$ARCH/$SDK/$variant 
	ROUT=$RELEASE/$variant
	for U in $(ls -1 $RIN); do
	echo "- Release <$RIN/$U> to <$ROUT>"
	cp -rdf $RIN/$U $ROUT/
	rm -rf $RIN/$U
	done
	}
NANO (){
	local variant=nano
	local list="
	AndroidAuto
Arcore
DeskClockGoogle
DevicePolicy
DreamLiner
Gmail
GoogleAssistant
GoogleCalculator
GoogleCalendar
GoogleContacts
GoogleDialer
GoogleKeyboard
LocationHistory
MarkupGoogle
Messaging
PlayGames
SoundPicker
WallpaperPicker
Wellbeing
	"
	
	local IN=$BASED/packages/output/$ARCH/$SDK/
	local OUT=$BASED/core/litegapps/nano/modules/$ARCH/$SDK/
	rm -rf $OUT
	CORE_MODULE $BASED/packages/output/$ARCH/$SDK/core $BASED/core/litegapps/nano/modules/$ARCH/$SDK/core
	
	for M in $(ls -1 $BASED/packages/output/$ARCH/$SDK/gapps) ; do
	for M1 in $list; do
	local check=false
	if [ $M = $M1 ]; then
	local check=true
	break
	fi
	done
	
	if $check; then
	echo "+ Copying <$BASED/packages/output/$ARCH/$SDK/gapps/$M> To <$BASED/core/litegapps/nano/modules/$ARCH/$SDK/gapps/>"
	
	mkdir -p $BASED/core/litegapps/nano/modules/$ARCH/$SDK/gapps/$M
	cp -rdf $BASED/packages/output/$ARCH/$SDK/gapps/$M $BASED/core/litegapps/nano/modules/$ARCH/$SDK/gapps/
	else
	echo "! Skipping $M"
	fi
	done
	
	bash $BASED/build.sh make litegapps $variant $ARCH $SDK
	[ ! -d $RELEASE/$variant ] && mkdir -p $RELEASE/$variant
	RIN=$BASED/output/litegapps/$ARCH/$SDK/$variant 
	ROUT=$RELEASE/$variant
	for U in $(ls -1 $RIN); do
	echo "- Release <$RIN/$U> to <$ROUT>"
	cp -rdf $RIN/$U $ROUT/
	rm -rf $RIN/$U
	done
	}
BASIC (){
	local variant=basic
	local list="
	AndroidAuto
Arcore
DevicePolicy
Gmail
LocationHistory
MarkupGoogle
SoundPicker
Wellbeing
	"
	
	local IN=$BASED/packages/output/$ARCH/$SDK/
	local OUT=$BASED/core/litegapps/basic/modules/$ARCH/$SDK/
	rm -rf $OUT
	CORE_MODULE $BASED/packages/output/$ARCH/$SDK/core $BASED/core/litegapps/basic/modules/$ARCH/$SDK/core
	
	for M in $(ls -1 $BASED/packages/output/$ARCH/$SDK/gapps) ; do
	for M1 in $list; do
	local check=false
	if [ $M = $M1 ]; then
	local check=true
	break
	fi
	done
	
	if $check; then
	echo "+ Copying <$BASED/packages/output/$ARCH/$SDK/gapps/$M> To <$BASED/core/litegapps/basic/modules/$ARCH/$SDK/gapps/>"
	
	mkdir -p $BASED/core/litegapps/basic/modules/$ARCH/$SDK/gapps/$M
	cp -rdf $BASED/packages/output/$ARCH/$SDK/gapps/$M $BASED/core/litegapps/basic/modules/$ARCH/$SDK/gapps/
	else
	echo "! Skipping $M"
	fi
	done
	
	bash $BASED/build.sh make litegapps $variant $ARCH $SDK
	[ ! -d $RELEASE/$variant ] && mkdir -p $RELEASE/$variant
	RIN=$BASED/output/litegapps/$ARCH/$SDK/$variant 
	ROUT=$RELEASE/$variant
	for U in $(ls -1 $RIN); do
	echo "- Release <$RIN/$U> to <$ROUT>"
	cp -rdf $RIN/$U $ROUT/
	rm -rf $RIN/$U
	done
	}
USER (){
	local variant=user
	local list="
	Chrome
GoogleKeyboard
PixelLauncher
PixelLiveWallpaper
Gmail

	"
	
	local IN=$BASED/packages/output/$ARCH/$SDK/
	local OUT=$BASED/core/litegapps/user/modules/$ARCH/$SDK/
	rm -rf $OUT
	CORE_MODULE $BASED/packages/output/$ARCH/$SDK/core $BASED/core/litegapps/user/modules/$ARCH/$SDK/core
	
	for M in $(ls -1 $BASED/packages/output/$ARCH/$SDK/gapps) ; do
	for M1 in $list; do
	local check=false
	if [ $M = $M1 ]; then
	local check=true
	break
	fi
	done
	
	if $check; then
	echo "+ Copying <$BASED/packages/output/$ARCH/$SDK/gapps/$M> To <$BASED/core/litegapps/user/modules/$ARCH/$SDK/gapps/>"
	
	mkdir -p $BASED/core/litegapps/user/modules/$ARCH/$SDK/gapps/$M
	cp -rdf $BASED/packages/output/$ARCH/$SDK/gapps/$M $BASED/core/litegapps/user/modules/$ARCH/$SDK/gapps/
	else
	echo "! Skipping $M"
	fi
	done
	
	bash $BASED/build.sh make litegapps $variant $ARCH $SDK
	[ ! -d $RELEASE/$variant ] && mkdir -p $RELEASE/$variant
	RIN=$BASED/output/litegapps/$ARCH/$SDK/$variant 
	ROUT=$RELEASE/$variant
	for U in $(ls -1 $RIN); do
	echo "- Release <$RIN/$U> to <$ROUT>"
	cp -rdf $RIN/$U $ROUT/
	rm -rf $RIN/$U
	done
	}
	
GO (){
	local variant=go
	local list="
	AssistantGo
GalleryGo
GmailGo
MapsGo
NavigationGo
VelvetGo
	"
	
	local IN=$BASED/packages/output/$ARCH/$SDK/
	local OUT=$BASED/core/litegapps/go/modules/$ARCH/$SDK/
	rm -rf $OUT
	CORE_MODULE $BASED/packages/output/$ARCH/$SDK/core $BASED/core/litegapps/go/modules/$ARCH/$SDK/core
	
	for M in $(ls -1 $BASED/packages/output/$ARCH/$SDK/go) ; do
	for M1 in $list; do
	local check=false
	if [ $M = $M1 ]; then
	local check=true
	break
	fi
	done
	
	if $check; then
	echo "+ Copying <$BASED/packages/output/$ARCH/$SDK/go/$M> To <$BASED/core/litegapps/go/modules/$ARCH/$SDK/go/>"
	
	mkdir -p $BASED/core/litegapps/go/modules/$ARCH/$SDK/go/$M
	cp -rdf $BASED/packages/output/$ARCH/$SDK/go/$M $BASED/core/litegapps/go/modules/$ARCH/$SDK/go
	else
	echo "! Skipping $M"
	fi
	done
	
	bash $BASED/build.sh make litegapps $variant $ARCH $SDK
	[ ! -d $RELEASE/$variant ] && mkdir -p $RELEASE/$variant
	RIN=$BASED/output/litegapps/$ARCH/$SDK/$variant 
	ROUT=$RELEASE/$variant
	for U in $(ls -1 $RIN); do
	echo "- Release <$RIN/$U> to <$ROUT>"
	cp -rdf $RIN/$U $ROUT/
	rm -rf $RIN/$U
	done
	}
	
CORE (){
	local variant=core
	local list="
	AndroidAuto
	Arcore
	DevicePolicy
	Gmail
	LocationHistory
	MarkupGoogle
	PlayGames
	SoundPicker
	Wellbeing
	"
	
	local IN=$BASED/packages/output/$ARCH/$SDK/
	local OUT=$BASED/core/litegapps/core/modules/$ARCH/$SDK/
	rm -rf $OUT
	CORE_MODULE $BASED/packages/output/$ARCH/$SDK/core $BASED/core/litegapps/core/modules/$ARCH/$SDK/core
	
	bash $BASED/build.sh make litegapps $variant $ARCH $SDK
	[ ! -d $RELEASE/$variant ] && mkdir -p $RELEASE/$variant
	RIN=$BASED/output/litegapps/$ARCH/$SDK/$variant 
	ROUT=$RELEASE/$variant
	for U in $(ls -1 $RIN); do
	echo "- Release <$RIN/$U> to <$ROUT>"
	cp -rdf $RIN/$U $ROUT/
	rm -rf $RIN/$U
	done
	}
	
	
	
while true; do
echo -n "    Select architecture : "
read selarch
case $selarch in
arm64 | arm | x86 | x86_64)
arch=$selarch
break
;;
*)
echo "! $selarch not found list"
;;
esac
done
while true; do
echo -n "    Select SDK : "
read selsdk
case $selsdk in
28 | 29 | 30 | 31 | 32 | 33 | 34)
sdk=$selsdk
break
;;
*)
echo "! $selsdk not found list"
;;
esac
done

for ARCH in $arch; do
for SDK in $sdk; do
RELEASE=/home/frs/project/litegapps/litegapps/$ARCH/$SDK
bash $BASED/packages/make make $ARCH $SDK
rm -rf $BASED/output
PIXEL
MICRO
NANO
BASIC
USER
GO
CORE

rm -rf $BASED/tmp_files
done
done


