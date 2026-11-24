@echo off
cd /d "%~dp0"

echo.
echo  =====================================
echo    FaceMimic Local Server Starting...
echo  =====================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

if not exist node_modules (
    echo [INFO] First run, installing dependencies...
    call npm install --omit=dev
    if errorlevel 1 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
)

echo [OK] Starting backend...
echo.
echo  Open browser: http://localhost:8766/
echo.
echo  Press Ctrl+C to stop
echo  -------------------------------------
echo.

node backend.js
pause
