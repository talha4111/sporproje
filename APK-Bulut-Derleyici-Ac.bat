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
set "GIT_EXE=%LOCALAPPDATA%\GitHubDesktop\app-3.6.7\resources\app\git\cmd\git.exe"
if exist "%GIT_EXE%" (
    "%GIT_EXE%" add -A
    "%GIT_EXE%" commit -m "Android APK guncellemesi" 2>nul
)

echo.
echo [3/3] GitHub Desktop aciliyor...
echo --------------------------------------------------------
echo GitHub Desktop acildiginda:
echo 1. "Publish repository" (veya "Push origin") butonuna basin.
echo 2. GitHub sayfanizdaki "Actions" sekmesine tiklayin.
echo 3. 2 dakika icinde "MakroTakip-Android-APK" dosyaniz hazir!
echo --------------------------------------------------------
start "" "%LOCALAPPDATA%\GitHubDesktop\GitHubDesktop.exe" --open-repo "%~dp0"
pause
