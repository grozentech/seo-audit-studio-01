@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or not on PATH.
  echo Install Node.js 20 or newer and open this file again.
  pause
  exit /b 1
)
echo.
echo =============================================
echo   HUSTLE WITH ARUN - SEO AUDIT STUDIO
 echo =============================================
echo.
echo Open this address in your browser:
echo http://127.0.0.1:4173
echo.
echo Keep this window open while auditing websites.
echo Press Ctrl+C to stop the server.
echo.
node server.js
pause
