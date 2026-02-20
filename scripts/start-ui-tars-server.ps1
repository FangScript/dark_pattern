# Start UI-TARS Server for Dark Pattern Hunter Extension
# This script starts a UI-TARS model server compatible with OpenAI API format

param(
    [int]$Port = 8000,
    [string]$ModelPath = "D:\fyp v3\Uitar\UI-TARS-1.5-7B",
    [string]$Host = "localhost"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "UI-TARS Server Startup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if model path exists
if (-not (Test-Path $ModelPath)) {
    Write-Host "ERROR: Model path not found: $ModelPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please update the ModelPath parameter or ensure the UI-TARS model is installed." -ForegroundColor Yellow
    Write-Host "Expected path: D:\fyp v3\Uitar\UI-TARS-1.5-7B" -ForegroundColor Yellow
    exit 1
}

Write-Host "Model Path: $ModelPath" -ForegroundColor Green
Write-Host "Server URL: http://${Host}:${Port}/v1" -ForegroundColor Green
Write-Host ""

# Check if port is already in use
$portInUse = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "WARNING: Port $Port is already in use!" -ForegroundColor Yellow
    Write-Host "Please stop the existing server or use a different port." -ForegroundColor Yellow
    Write-Host ""
    $response = Read-Host "Do you want to continue anyway? (y/n)"
    if ($response -ne "y") {
        exit 1
    }
}

# Check for Python and vLLM
$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $pythonCmd = "python3"
} else {
    Write-Host "ERROR: Python not found. Please install Python 3.8+ to run UI-TARS server." -ForegroundColor Red
    exit 1
}

Write-Host "Using Python: $pythonCmd" -ForegroundColor Green

# Check if vLLM is installed
Write-Host "Checking for vLLM and dependencies..." -ForegroundColor Yellow
$vllmCheck = & $pythonCmd -m pip show vllm 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: vLLM is not installed in the current Python environment!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To install vLLM:" -ForegroundColor Cyan
    Write-Host "  pip install vllm" -ForegroundColor White
    Write-Host ""
    Write-Host "Or run the installation script:" -ForegroundColor Cyan
    Write-Host "  .\scripts\install-ui-tars-dependencies.ps1" -ForegroundColor White
    Write-Host ""
    $response = Read-Host "Do you want to install vLLM now? (y/n)"
    if ($response -eq "y") {
        Write-Host "Installing vLLM (this may take several minutes)..." -ForegroundColor Yellow
        & $pythonCmd -m pip install vllm
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Failed to install vLLM. Please install manually." -ForegroundColor Red
            exit 1
        }
        Write-Host "✓ vLLM installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Cannot proceed without vLLM. Exiting." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✓ vLLM is installed!" -ForegroundColor Green
    $vllmVersion = ($vllmCheck | Select-String "Version:").ToString()
    Write-Host $vllmVersion -ForegroundColor Cyan
}

# Check for uvloop (required dependency)
Write-Host "Checking for uvloop..." -ForegroundColor Yellow
$uvloopCheck = & $pythonCmd -c "import uvloop" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠ uvloop is missing (required for vLLM server)" -ForegroundColor Yellow
    Write-Host "Installing uvloop..." -ForegroundColor Yellow
    & $pythonCmd -m pip install uvloop
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠ Failed to install uvloop. Server may still work on Windows." -ForegroundColor Yellow
        Write-Host "Note: uvloop is optional on Windows, but recommended for performance." -ForegroundColor Cyan
    } else {
        Write-Host "✓ uvloop installed!" -ForegroundColor Green
    }
} else {
    Write-Host "✓ uvloop is available!" -ForegroundColor Green
}
Write-Host ""

# Check if UI-TARS server package is installed
Write-Host "Checking UI-TARS installation..." -ForegroundColor Yellow
$checkUITars = & $pythonCmd -c "import ui_tars; print('OK')" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: UI-TARS Python package not found." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To install UI-TARS server:" -ForegroundColor Cyan
    Write-Host "1. Navigate to: D:\fyp v3\Uitar" -ForegroundColor White
    Write-Host "2. Install dependencies: pip install -r requirements.txt" -ForegroundColor White
    Write-Host "3. Install UI-TARS: pip install ui-tars" -ForegroundColor White
    Write-Host ""
    $response = Read-Host "Do you want to continue anyway? (y/n)"
    if ($response -ne "y") {
        exit 1
    }
}

Write-Host "Starting UI-TARS server..." -ForegroundColor Green
Write-Host ""
Write-Host "Server will be available at: http://${Host}:${Port}/v1" -ForegroundColor Cyan
Write-Host "Model: ui-tars-1.5-7b" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start UI-TARS server using vLLM (OpenAI-compatible API)
Write-Host "Starting UI-TARS server with vLLM..." -ForegroundColor Yellow
Write-Host "Command: $pythonCmd -m vllm.entrypoints.openai.api_server --model `"$ModelPath`" --port $Port --host $Host" -ForegroundColor Cyan
Write-Host ""

try {
    # Start vLLM server
    & $pythonCmd -m vllm.entrypoints.openai.api_server `
        --model $ModelPath `
        --port $Port `
        --host $Host `
        --api-key "not-needed"
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to start UI-TARS server." -ForegroundColor Red
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Ensure vLLM is installed: pip install vllm" -ForegroundColor White
    Write-Host "2. Check model path exists: $ModelPath" -ForegroundColor White
    Write-Host "3. Ensure port $Port is available" -ForegroundColor White
    Write-Host "4. Try running manually:" -ForegroundColor White
    Write-Host "   cd `"D:\fyp v3\Uitar`"" -ForegroundColor Cyan
    Write-Host "   python -m vllm.entrypoints.openai.api_server --model `"$ModelPath`" --port $Port" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}
