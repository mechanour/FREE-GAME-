@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it from https://nodejs.org, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\ws\package.json" (
  echo Installing the game server dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting Neon Strike...
start "Neon Strike Server" cmd /k "cd /d ""%~dp0"" && npm.cmd start"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
