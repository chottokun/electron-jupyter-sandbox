@echo off
chcp 65001 > nul 2>&1
rem ====================================================
rem  JupyterSandbox Launch Script
rem ====================================================
cd /d "%~dp0"
if exist "%~dp0JupyterSandbox.exe" (
    start "" "%~dp0JupyterSandbox.exe"
) else (
    echo [ERROR] JupyterSandbox.exe not found in "%~dp0"
    pause
)
