# Start UI-TARS Server on Windows (uvloop-free)
# This script patches the uvloop import issue on Windows

param(
    [int]$Port = 8000,
    [string]$ModelPath = "D:\fyp v3\Uitar\UI-TARS-1.5-7B",
    [string]$Host = "localhost"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "UI-TARS Server Startup (Windows)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if model path exists
if (-not (Test-Path $ModelPath)) {
    Write-Host "ERROR: Model path not found: $ModelPath" -ForegroundColor Red
    exit 1
}

Write-Host "Model Path: $ModelPath" -ForegroundColor Green
Write-Host "Server URL: http://${Host}:${Port}/v1" -ForegroundColor Green
Write-Host ""

# Check Python
$pythonCmd = "python"
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Python not found!" -ForegroundColor Red
    exit 1
}

# Use the Windows-compatible Python script
$scriptPath = Join-Path $PSScriptRoot "run-ui-tars-windows.py"

if (-not (Test-Path $scriptPath)) {
    Write-Host "ERROR: Windows-compatible script not found: $scriptPath" -ForegroundColor Red
    Write-Host "Please ensure run-ui-tars-windows.py exists in the scripts folder." -ForegroundColor Yellow
    exit 1
}

Write-Host "Starting UI-TARS server (Windows-compatible)..." -ForegroundColor Yellow
Write-Host "Note: Using uvloop compatibility patch for Windows" -ForegroundColor Cyan
Write-Host ""
Write-Host "Server will be available at: http://${Host}:${Port}/v1" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

try {
    & $pythonCmd $scriptPath --model $ModelPath --port $Port --host $Host --api-key "not-needed"
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to start server" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Ensure vLLM is installed: pip install vllm" -ForegroundColor White
    Write-Host "2. Check model path exists: $ModelPath" -ForegroundColor White
    Write-Host "3. Try running directly: python scripts\run-ui-tars-windows.py --model `"$ModelPath`" --port $Port" -ForegroundColor Cyan
}
