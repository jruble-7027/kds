# Chick-fil-A Catering Fulfillment Portal PowerShell Launcher
Write-Host "=======================================================" -ForegroundColor Red
Write-Host "   🐔 Chick-fil-A Catering & Kitchen Fulfillment" -ForegroundColor Yellow
Write-Host "=======================================================" -ForegroundColor Red
Write-Host ""
Write-Host "Launching server and opening your browser..." -ForegroundColor Cyan
Write-Host ""

$nodeCmd = "C:\Users\jruble_wcatrojans\AppData\Roaming\Antigravity\bin\agy-node.cmd"
if (-not (Test-Path $nodeCmd)) {
    $nodeCmd = "node"
}

Start-Process "http://localhost:3000"
& $nodeCmd server.js
