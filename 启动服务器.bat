@echo off
chcp 65001 >nul
title FaceMimic 本地服务器
cd /d "%~dp0"

echo.
echo  ╔═══════════════════════════════════╗
echo  ║   🚀 FaceMimic 本地服务器启动中...   ║
echo  ╚═══════════════════════════════════╝
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo ❌ 没找到 Node.js，请先安装 https://nodejs.org
    pause
    exit /b 1
)

if not exist node_modules (
    echo 📦 首次运行，正在安装依赖...
    call npm install --omit=dev
    if errorlevel 1 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
)

echo ✅ 依赖就绪，启动后端...
echo.
echo 👉 浏览器打开: http://localhost:8766/
echo.
echo 按 Ctrl+C 停止服务器
echo ───────────────────────────────────────
echo.

node backend.js
pause
