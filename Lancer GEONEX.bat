@echo off
chcp 65001 >nul
title GEONEX
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est requis : https://nodejs.org
  pause
  exit /b 1
)
node scripts\launch.mjs %*
echo.
pause
