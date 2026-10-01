@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动本地服务器...
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8080'"
node server.js
pause
