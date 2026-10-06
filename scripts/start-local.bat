@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://127.0.0.1:4173/
  node serve.mjs
  exit /b
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://127.0.0.1:4173/
  python -m http.server 4173 --bind 127.0.0.1 --directory dist
  exit /b
)
echo Please install Node.js 22 or Python 3 to run the local package.
pause
