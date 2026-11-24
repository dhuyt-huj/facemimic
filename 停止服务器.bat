@echo off
title FaceMimic 停止服务器
taskkill /F /IM node.exe /FI "WINDOWTITLE eq FaceMimic*" 2>nul
taskkill /F /FI "WINDOWTITLE eq FaceMimic*" 2>nul
echo.
echo ✅ FaceMimic 服务器已停止
timeout /t 2 >nul
