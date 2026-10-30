@echo off
chcp 65001 >nul
title GEONEX - Partage public
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est requis : https://nodejs.org
  pause
  exit /b 1
)
node scripts\share.mjs
echo.
pause
