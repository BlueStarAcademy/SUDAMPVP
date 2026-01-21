# Redis Start Script (WSL2)

Write-Host "=== Starting Redis ===" -ForegroundColor Green
Write-Host ""

# Start Redis in WSL2
Write-Host "Starting Redis server in WSL2..." -ForegroundColor Yellow
wsl sudo service redis-server start

if ($LASTEXITCODE -eq 0) {
    Write-Host "Redis server started" -ForegroundColor Green
    
    # Test connection
    Start-Sleep -Seconds 2
    $testResult = Test-NetConnection -ComputerName localhost -Port 6379 -InformationLevel Quiet -WarningAction SilentlyContinue
    
    if ($testResult) {
        Write-Host "Redis connection confirmed (localhost:6379)" -ForegroundColor Green
    } else {
        Write-Host "Redis started but connection cannot be confirmed" -ForegroundColor Yellow
        Write-Host "  Check manually in WSL2: wsl redis-cli ping" -ForegroundColor Cyan
    }
} else {
    Write-Host "Redis start failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Redis may not be installed in WSL2." -ForegroundColor Yellow
    Write-Host "Installation:" -ForegroundColor Cyan
    Write-Host "  wsl" -ForegroundColor White
    Write-Host "  sudo apt-get update" -ForegroundColor White
    Write-Host "  sudo apt-get install redis-server" -ForegroundColor White
    Write-Host ""
    Write-Host "Or use Docker:" -ForegroundColor Cyan
    Write-Host '  docker run -d -p 6379:6379 --name redis redis:7-alpine' -ForegroundColor White
}

Write-Host ""
