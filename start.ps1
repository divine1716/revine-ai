# D.Bonid AI Chatbot Startup Script

Write-Host "🤖 D.Bonid AI Chatbot" -ForegroundColor Cyan
Write-Host "=====================`n" -ForegroundColor Cyan

# Check if port 8000 is in use
$port = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($port) {
    Write-Host "⚠️  Port 8000 is already in use!" -ForegroundColor Yellow
    Write-Host "Opening browser to existing server...`n" -ForegroundColor Yellow
    Start-Process "http://127.0.0.1:8000"
    exit
}

# Activate virtual environment and start server
Write-Host "✅ Starting server on http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server`n" -ForegroundColor Yellow

& ".\venv\Scripts\Activate.ps1"
Start-Sleep -Seconds 2
Start-Process "http://127.0.0.1:8000"
python app.py
