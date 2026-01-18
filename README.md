![](https://github.com/litegapps/litegapps.github.io/raw/master/pages/images/new_i.png)
# LiteGapps
**LiteGapps** is a custom Google Apps on the Android operating system, an open source project that focuses on small, efficient, and comprehensive.

This is a tool for building [litegapps](https://litegapps.github.io)


## Requestment Packages

``zip``

``tar``

``xz``

``unzip``

``bash``

``brotli``

``curl``

### Termux Installation Package
``apt update && pkg upgrade && pkg install zip tar xz unzip bash brotli curl``

### Ubuntu Installation Package
``sudo apt update && sudo apt upgrade -y && sudo apt install -y zip tar xz-utils unzip bash brotli curl``


## Cloning
### https
``git clone https://github.com/litegapps/litegapps.git``
### ssh
``git clone git@github.com:litegapps/litegapps.git``

## Configure

``version=4.3`` version litegapps
 
``version.code=4.3`` version code litegapps
 
``codename=Stable`` Codename status build``
 
``name.builder=soekarno(example)`` Name builder``
 
``build.status=unofficial`` build status official/unofficial
 
``set.time.stamp=true``  Set time stamp true/false
 
``date.time=202007122239`` date time stamp
 
``apk.compress.type=litegapps_compress`` litegapps_compress or litegapps_default

``compression=brotli`` support compressions ``xz,br``
 
``compression.level=1`` level compressions ``1 - 9``
 
``zip.level=1 level compressions`` ``1 - 9``
 
``zip.signer=false`` zip signer ``true/false``
 
``litegapps_apk_compress_level=5`` level compressions apk in zip/customize.sh ``1 - 9``
 
## Litegapps prop
``litegapps.build=true`` true/false
 
``litegapps.restore=lite`` list-restore = lite,core,go,micro,pixel,nano,basic
 
``litegapps.type=lite`` list-type = lite,core,go,micro,pixel,nano,basic
 
## Litegapps++ prop
``litegapps++.build=true`` true/false
 
``litegapps++.restore=reguler`` list-restore = ``reguler,lts,microg``
 
``litegapps++.type=microg`` list-type = ``reguler,lts,microg``
 

## Compression benchmark
![Benchmark](https://github.com/wahyu6070/Cloud/raw/main/project/litegapps/images/compres_lvl.jpg)

## Building
### Restoring
You have to restore the binary and some of the gapps files that are needed first.

``sh build.sh restore`` Restoring files bin,gapps files
 
### Make Gapps
``sh build.sh make`` (Building)

you can also do a build by ignoring the config for example
``bash build.sh make litegapps $variant $ARCH $SDK``
 
```bash
bash build.sh make litegapps lite arm64 36

```
### Cleaning
``sh build.sh clean`` (Cleaning Directory)

## Watch video building
[<img src="https://img.youtube.com/vi/5ddkNReE2RE/maxresdefault.jpg" width="50%">](https://youtu.be/NiT2qBaYFdg?si=5VyyntICvjp5iseD)

## Download
[Click here](https://litegapps.github.io/)

## Social Media
[Telegram](https://t.me/litegapps)
 
[XDA](https://forum.xda-developers.com/t/litegapps-systemless.4146013/)

## CREDIT
[OpenGapps](https://opengapps.org/)
 
[ApkPure](https://apkpure.com/)
 
[Kopi installer](https://github.com/wahyu6070/Kopi-installer)
 
