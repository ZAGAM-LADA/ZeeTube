@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20.19+ or 22.12+ is required. & pause & exit /b 1)
where npm >nul 2>nul || (echo npm is required. & pause & exit /b 1)
for /f "delims=" %%v in ('node -p "process.versions.node"') do set NODE_VERSION=%%v
echo Detected Node.js %NODE_VERSION%
if not exist .env (
  copy .env.example .env >nul
  echo Created .env. Remote downloads remain disabled until you configure authorized hosts.
)
if not exist node_modules (
  echo Installing project dependencies...
  call npm install
  if errorlevel 1 goto fail
)
echo Starting ZeeTube. Open http://127.0.0.1:5173 when Vite is ready.
call npm run dev
exit /b %ERRORLEVEL%
:fail
echo Dependency installation failed. Check your internet connection and npm registry access.
pause
exit /b 1
