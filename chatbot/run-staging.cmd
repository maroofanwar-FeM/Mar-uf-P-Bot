@echo off
cd /d "%~dp0"
echo Starting staging (port 4547): server + tunnel, each in its own auto-restart window.
echo Close either window to stop that piece; closing this window does not stop them.
start "Mar'uf Chatbot - STAGING Server (4547)" cmd /k loop-server.cmd 4547
start "Mar'uf Chatbot - STAGING Tunnel (4547)" cmd /k loop-tunnel.cmd 4547
