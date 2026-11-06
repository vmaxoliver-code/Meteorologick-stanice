@echo off
chcp 65001 >nul
title Nahrávání na GitHub - MeteoCenter Pro

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0nahrat_na_github.ps1"

pause
