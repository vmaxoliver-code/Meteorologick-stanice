@echo off
chcp 65001 >nul
title MeteoCenter Pro - Server

echo =========================================================================
echo   🌤️ METEOCENTER PRO // SPUŠTĚNÍ METEOROLOGICKÉHO SERVERU
echo =========================================================================
echo.

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
    echo [CHYBA] Python 3 nebyl v systému automaticky nalezen!
    echo Zkontrolujte instalaci Pythonu.
    pause
    exit /b 1
)

echo Používám Python: %PYTHON_EXE%
echo.
echo -> Otevírám Dashboard ve webovém prohlížeči (http://localhost:8000)...
timeout /t 2 /nobreak >nul
start "" "http://localhost:8000"

echo -> Spouštím aplikaci a WebSocket stream...
"%PYTHON_EXE%" run_server.py

pause
