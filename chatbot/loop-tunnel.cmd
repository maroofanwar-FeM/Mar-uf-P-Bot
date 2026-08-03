@echo off
setlocal
set TPORT=%1
cd /d "%~dp0"

:loop
echo [%date% %time%] Starting Cloudflare tunnel for port %TPORT% ...
rem Tee-Object mirrors output to the console (so this window still shows it
rem live) and to tunnel-<port>.log, which is where the public *.trycloudflare.com
rem URL ends up so it can be read back without watching this window.
powershell -NoProfile -Command "& '%~dp0tools\cloudflared.exe' tunnel --url http://localhost:%TPORT% 2>&1 | Tee-Object -FilePath '%~dp0tunnel-%TPORT%.log'"
echo [%date% %time%] Tunnel exited (code %errorlevel%) - restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto loop
