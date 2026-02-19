@echo off
REM ============================================================
REM Telegram Bot - Standalone Deployment Script for Windows
REM Run this directly on the server (no remote needed)
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ==========================================
echo Telegram Bot - Standalone Deployment
echo ==========================================
echo.

REM Check if Node.js is installed
echo [1/5] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js not found. Please install from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo ✅ Node.js: %%i

REM Set application directory
set APP_DIR=C:\Apps\telegram-bot-freshdesk
set PROJ_DIR=%~dp0

echo.
echo [2/5] Setting up directories...
if not exist "%APP_DIR%" (
    mkdir "%APP_DIR%"
    echo ✅ Created %APP_DIR%
) else (
    echo ℹ️  Directory already exists: %APP_DIR%
)

echo.
echo [3/5] Copying project files...
REM Copy files (excluding node_modules)
xcopy "%PROJ_DIR%*" "%APP_DIR%\" /E /I /Y /EXCLUDE:exclude.txt >nul 2>&1
if errorlevel 1 (
    echo Note: Running robocopy as more reliable...
    robocopy "%PROJ_DIR%" "%APP_DIR%" /E /XD node_modules .git /XF exclude.txt >nul 2>&1
)
echo ✅ Files copied

echo.
echo [4/5] Installing npm dependencies...
cd /d "%APP_DIR%"
call npm install --production
if errorlevel 1 (
    echo ❌ npm install failed
    pause
    exit /b 1
)
echo ✅ Dependencies installed

echo.
echo [5/5] Checking .env file...
if not exist "%APP_DIR%\.env" (
    echo.
    echo ⚠️  .env file not found! Creating template...
    (
        echo # Telegram Configuration
        echo TELEGRAM_BOT_TOKEN=8498347303:AAF0ApLxQQYvypzel_sCLRHVWNVe309BKKY
        echo TELEGRAM_BOT_USERNAME=Fresh_Note_Bot
        echo.
        echo # Freshdesk Configuration
        echo FRESHDESK_API_KEY=YOUR_API_KEY_HERE
        echo FRESHDESK_DOMAIN=YOUR_DOMAIN_HERE
        echo.
        echo # Server Configuration
        echo WEBHOOK_PORT=3000
        echo WEBHOOK_URL=http://169.1.17.113:3000/webhook
        echo NODE_ENV=production
    ) > "%APP_DIR%\.env"
    echo ✅ Template created at: %APP_DIR%\.env
    echo.
    echo ⚠️  IMPORTANT: Edit .env and update:
    echo    - FRESHDESK_API_KEY
    echo    - FRESHDESK_DOMAIN
    echo.
) else (
    echo ✅ .env file found
)

echo.
echo ==========================================
echo ✅ Deployment Complete!
echo ==========================================
echo.
echo Next steps:
echo.
echo 1. Edit configuration file:
echo    %APP_DIR%\.env
echo.
echo 2. Start the bot:
echo    cd %APP_DIR%
echo    npm start
echo.
echo 3. Or run the quick start script:
echo    %APP_DIR%\run-local.bat
echo.
echo ==========================================
echo.
pause
