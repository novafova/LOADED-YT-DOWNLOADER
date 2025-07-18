@echo off
echo Starting Loaded...
set NODE_PATH=%~dp0\node_modules
cd /d "%~dp0"
start "" "dist\win-unpacked\Loaded.exe"