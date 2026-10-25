@echo off
chcp 65001 >nul
title Makro Takip - Android APK Bulut Hazirlayici
echo ========================================================
echo   MAKRO TAKIP - ANDROID .APK BULUT PAKETLEYICI
echo ========================================================
echo.
echo [1/3] Web uygulamasi derleniyor ve Android projesine aktariliyor...
call npm.cmd run apk:sync
if %errorlevel% neq 0 (
    echo Hata olustu!
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Git degisiklikleri kaydediliyor...
for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
    if exist "%%D\resources\app\git\cmd\git.exe" set "GIT_EXE=%%D\resources\app\git\cmd\git.exe"
)
if defined GIT_EXE (
    "%GIT_EXE%" add -A
    "%GIT_EXE%" commit -m "Android APK guncellemesi" 2>nul
)

echo.
echo [3/3] GitHub Desktop'ta sporproje aciliyor...
start "" "%LOCALAPPDATA%\GitHubDesktop\bin\github.bat" "%~dp0"
pause
