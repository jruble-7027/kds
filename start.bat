@echo off
title Chick-fil-A Catering Fulfillment Portal
echo =======================================================
echo    🐔 Chick-fil-A Catering & Kitchen Fulfillment
echo =======================================================
echo.
echo Launching server and opening your browser...
echo.

set NODE_CMD="C:\Users\jruble_wcatrojans\AppData\Roaming\Antigravity\bin\agy-node.cmd"
if not exist %NODE_CMD% (
    set NODE_CMD=node
)

REM Open browser in 1 second
start "" http://localhost:3000

REM Run Node server
%NODE_CMD% server.js
pause
