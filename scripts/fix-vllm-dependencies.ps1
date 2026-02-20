# Fix vLLM Dependencies
# Installs missing dependencies for vLLM server

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Fixing vLLM Dependencies" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Python
$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $pythonCmd = "python3"
} else {
    Write-Host "ERROR: Python not found!" -ForegroundColor Red
    exit 1
}

Write-Host "Using Python: $pythonCmd" -ForegroundColor Green
Write-Host "Python path: $((Get-Command $pythonCmd).Source)" -ForegroundColor Cyan
Write-Host ""

# Install uvloop (required for vLLM API server)
Write-Host "Installing uvloop..." -ForegroundColor Yellow
& $pythonCmd -m pip install uvloop
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ uvloop installed successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠ uvloop installation had issues" -ForegroundColor Yellow
    Write-Host "Note: On Windows, uvloop may not be critical, but it's recommended." -ForegroundColor Cyan
}

Write-Host ""

# Install other common vLLM dependencies
Write-Host "Installing additional vLLM dependencies..." -ForegroundColor Yellow

$dependencies = @(
    "fastapi",
    "uvicorn[standard]",
    "pydantic",
    "httpx"
)

foreach ($dep in $dependencies) {
    Write-Host "Installing $dep..." -ForegroundColor Cyan
    & $pythonCmd -m pip install $dep --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ $dep" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ $dep (may already be installed)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Dependency Check Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verify vLLM can be imported
Write-Host "Verifying vLLM installation..." -ForegroundColor Yellow
$vllmTest = & $pythonCmd -c "import vllm; print('vLLM version:', vllm.__version__)" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ vLLM is working!" -ForegroundColor Green
    Write-Host $vllmTest -ForegroundColor Cyan
} else {
    Write-Host "✗ vLLM import failed" -ForegroundColor Red
    Write-Host $vllmTest -ForegroundColor Red
}

Write-Host ""
Write-Host "You can now start the server:" -ForegroundColor Green
Write-Host "  cd `"D:\fyp v3\Uitar`"" -ForegroundColor Cyan
Write-Host "  python -m vllm.entrypoints.openai.api_server --model `"D:\fyp v3\Uitar\UI-TARS-1.5-7B`" --port 8000" -ForegroundColor Cyan
Write-Host ""
