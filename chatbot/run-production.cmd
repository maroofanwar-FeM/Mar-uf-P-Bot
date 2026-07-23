@echo off
cd /d "%~dp0"
echo Starting production (port 4546): server + tunnel, each in its own auto-restart window.
echo Close either window to stop that piece; closing this window does not stop them.
start "Mar'uf Chatbot - PRODUCTION Server (4546)" cmd /k loop-server.cmd 4546
start "Mar'uf Chatbot - PRODUCTION Tunnel (4546)" cmd /k loop-tunnel.cmd 4546
