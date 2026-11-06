@echo off
chcp 65001 >nul
title MeteoCenter Pro - Hardwarový Simulátor

set "PYTHON_EXE="

if exist "C:\Users\Student\AppData\Local\Programs\Python\Python311\python.exe" (
    set "PYTHON_EXE=C:\Users\Student\AppData\Local\Programs\Python\Python311\python.exe"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
) else (
    for /f "delims=" %%I in ('where python 2^>nul') do (
        if not defined PYTHON_EXE set "PYTHON_EXE=%%I"
    )
)

if not defined PYTHON_EXE (
    echo [CHYBA] Python 3 nebyl nalezen!
    pause
    exit /b 1
)

echo =========================================================================
echo   📡 HARDWAROVÝ SIMULÁTOR FYZICKÉ METEOSTANICE
echo =========================================================================
echo Odesílá reálnou telemetrii na http://localhost:8000/api/telemetry
echo Ukončení: stiskněte Ctrl+C
echo.

"%PYTHON_EXE%" simulate_station.py
pause
