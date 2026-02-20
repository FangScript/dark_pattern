# Simple UI-TARS Server Starter
# Automatically detects the correct Python and runs the server

param(
    [string]$ModelPath = "D:\fyp v3\Uitar\UI-TARS-1.5-7B",
    [int]$Port = 8000
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "UI-TARS Server Starter" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Find Python with vLLM installed
Write-Host "Looking for Python with vLLM installed..." -ForegroundColor Yellow

$pythonPaths = @(
    "C:\Users\HOME\AppData\Local\Programs\Python\Python310\python.exe",  # System Python path (has vLLM)
    "python",           # System Python (if in PATH)
    "python3",          # Alternative
    "$PSScriptRoot\..\.venv\Scripts\python.exe"  # Local venv (check last)
)

$foundPython = $null

foreach ($pythonPath in $pythonPaths) {
    if (Test-Path $pythonPath) {
        Write-Host "Testing: $pythonPath" -ForegroundColor Cyan
        $vllmCheck = & $pythonPath -c "import vllm; print('OK')" 2>&1
        if ($LASTEXITCODE -eq 0) {
            $foundPython = $pythonPath
            Write-Host "✓ Found Python with vLLM: $pythonPath" -ForegroundColor Green
            break
        }
    } elseif (Get-Command $pythonPath -ErrorAction SilentlyContinue) {
        Write-Host "Testing: $pythonPath" -ForegroundColor Cyan
        $vllmCheck = & $pythonPath -c "import vllm; print('OK')" 2>&1
        if ($LASTEXITCODE -eq 0) {
            $foundPython = $pythonPath
            Write-Host "✓ Found Python with vLLM: $pythonPath" -ForegroundColor Green
            break
        }
    }
}

if (-not $foundPython) {
    Write-Host ""
    Write-Host "ERROR: Could not find Python with vLLM installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "1. Install vLLM in current venv:" -ForegroundColor White
    Write-Host "   pip install vllm" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "2. Use system Python (if vLLM is installed there):" -ForegroundColor White
    Write-Host "   C:\Users\HOME\AppData\Local\Programs\Python\Python310\python.exe scripts\run-ui-tars-windows.py --model `"$ModelPath`" --port $Port" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# Check if script exists
$scriptPath = Join-Path $PSScriptRoot "run-ui-tars-windows.py"
if (-not (Test-Path $scriptPath)) {
    Write-Host "ERROR: Script not found: $scriptPath" -ForegroundColor Red
    exit 1
}

# Check model path
if (-not (Test-Path $ModelPath)) {
    Write-Host "ERROR: Model path not found: $ModelPath" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Starting UI-TARS server..." -ForegroundColor Green
Write-Host "Model: $ModelPath" -ForegroundColor Cyan
Write-Host "Server: http://localhost:$Port/v1" -ForegroundColor Cyan
Write-Host "Python: $foundPython" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start server
& $foundPython $scriptPath --model $ModelPath --port $Port --host localhost
