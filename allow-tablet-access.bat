@echo off
title Allow Kitchen Tablet Access (Port 3000)
echo =======================================================
echo   Opening Windows Firewall TCP Port 3000 for Tablet
echo =======================================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges to add Windows Firewall rule...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

netsh advfirewall firewall delete rule name="CFA Kitchen KDS Port 3000" >nul 2>&1
netsh advfirewall firewall add rule name="CFA Kitchen KDS Port 3000" dir=in action=allow protocol=TCP localport=3000 profile=any

echo.
echo [SUCCESS] Windows Firewall now allows Kitchen Tablet connections on Port 3000!
echo Tablet URL: http://192.168.68.68:3000
echo.
pause
