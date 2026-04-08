@echo off
REM Auto-start script for Telegram Bot Service Monitor
REM This script starts the health monitoring service for the bot

cd /d "%~dp0"

if exist node_modules\ (
    echo Starting Telegram Bot Service Monitor...
    node service-monitor.js
) else (
    echo Error: node_modules not found. Run 'npm install' first.
    pause
    exit /b 1
)
