@echo off
setlocal
cd /d "%~dp0"
title PRAWDOWID backend

set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
set "BUN_CMD=bun"

where bun >nul 2>&1
if not errorlevel 1 goto bun_found

if exist "node_modules\bun\bin\bun.exe" (
  set "BUN_CMD=node_modules\bun\bin\bun.exe"
  goto bun_found
)

goto no_bun

:bun_found
if not exist ".env" (
  if exist ".env.example" copy ".env.example" ".env" >nul
  echo.
  echo Created .env from .env.example.
  echo Set DEEPSEEK_API_KEY in backend\.env, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo Installing dependencies...
  echo.
  call "%BUN_CMD%" install
  if errorlevel 1 goto install_failed
)

echo.
echo Backend:  http://localhost:3000
echo Swagger:  http://localhost:3000/docs
echo Frontend: run prawdowid\start.bat (http://localhost:3001)
echo.
echo Make sure DEEPSEEK_API_KEY is set in backend\.env.
echo Keep this window open while using the app.
echo.
call "%BUN_CMD%" run dev

echo.
echo Backend has stopped.
pause
exit /b 0

:no_bun
echo.
echo Bun was not found.
echo Install it with:
echo   powershell -c "irm bun.sh/install.ps1 ^| iex"
echo then run this file again.
echo.
pause
exit /b 1

:install_failed
echo.
echo Dependency installation failed.
echo Check your internet connection and run this file again.
echo.
pause
exit /b 1