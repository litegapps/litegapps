BASED=$BASED

LIST_DIR="
gapps
files
modules
modules_files
"

for i in $LIST_DIR; do
	if [ -d $BASED/$i ]; then
		print "- Cleaning <$BASED/$i>"
		del $BASED/$i
		cdir $BASED/$i
		touch $BASED/$i/place_holder
	fi
done
