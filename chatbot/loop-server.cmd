@echo off
setlocal
set LOCAL_PORT=%1
cd /d "%~dp0"

:loop
echo [%date% %time%] Starting chatbot server on port %LOCAL_PORT% ...
node server.js
echo [%date% %time%] Server exited (code %errorlevel%) - restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto loop
