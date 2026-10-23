@echo off
rem Starter dev-serveren og apner appen i nettleseren.
cd /d "%~dp0"

if not exist node_modules (
  echo Installerer avhengigheter...
  call npm install || (pause & exit /b 1)
)

call npm run dev -- --open
pause
