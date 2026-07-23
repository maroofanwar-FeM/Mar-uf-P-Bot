@echo off
setlocal
set TPORT=%1
cd /d "%~dp0"

:loop
echo [%date% %time%] Starting Cloudflare tunnel for port %TPORT% ...
"%~dp0tools\cloudflared.exe" tunnel --url http://localhost:%TPORT%
echo [%date% %time%] Tunnel exited (code %errorlevel%) - restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto loop
