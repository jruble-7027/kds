@echo off
title Push Catering KDS Updates to GitHub + Railway
cd /d "%~dp0"
echo =======================================================
echo   Pushing Catering KDS to GitHub (Triggers Railway)
echo =======================================================
echo.
git add -A
git commit -m "Configure kds-production-9203.up.railway.app + Node 22 Dockerfile" 2>nul
git push -u origin main
echo.
echo =======================================================
echo   Done! Railway will now automatically redeploy.
echo =======================================================
pause
