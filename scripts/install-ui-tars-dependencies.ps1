# Install UI-TARS Server Dependencies
# This script installs the required packages to run UI-TARS server

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "UI-TARS Dependencies Installation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in a virtual environment
if ($env:VIRTUAL_ENV) {
    Write-Host "Virtual environment detected: $env:VIRTUAL_ENV" -ForegroundColor Green
} else {
    Write-Host "WARNING: No virtual environment detected!" -ForegroundColor Yellow
    Write-Host "It's recommended to use a virtual environment." -ForegroundColor Yellow
    Write-Host ""
    $response = Read-Host "Do you want to continue? (y/n)"
    if ($response -ne "y") {
        exit 1
    }
}

Write-Host ""

# Check Python version
Write-Host "Checking Python version..." -ForegroundColor Yellow
$pythonVersion = python --version 2>&1
Write-Host $pythonVersion -ForegroundColor Cyan

$versionMatch = $pythonVersion -match "Python (\d+)\.(\d+)"
if ($versionMatch) {
    $major = [int]$matches[1]
    $minor = [int]$matches[2]
    if ($major -lt 3 -or ($major -eq 3 -and $minor -lt 8)) {
        Write-Host "ERROR: Python 3.8+ is required. Current version: $pythonVersion" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Python version is compatible" -ForegroundColor Green
} else {
    Write-Host "WARNING: Could not determine Python version" -ForegroundColor Yellow
}

Write-Host ""

# Option 1: Install vLLM (for OpenAI-compatible API)
Write-Host "Option 1: Install vLLM (Recommended for OpenAI-compatible API)" -ForegroundColor Cyan
Write-Host "This provides an OpenAI-compatible server for UI-TARS models." -ForegroundColor White
Write-Host ""
$installVLLM = Read-Host "Install vLLM? (y/n)"

if ($installVLLM -eq "y") {
    Write-Host ""
    Write-Host "Installing vLLM..." -ForegroundColor Yellow
    Write-Host "Note: This may take several minutes and requires significant disk space." -ForegroundColor Yellow
    Write-Host ""
    
    try {
        pip install vllm
        Write-Host "✓ vLLM installed successfully!" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to install vLLM" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "You may need to install CUDA/ROCm dependencies separately." -ForegroundColor Yellow
        Write-Host "See: https://docs.vllm.ai/en/latest/getting_started/installation.html" -ForegroundColor Cyan
    }
}

Write-Host ""

# Option 2: Install UI-TARS package (if available)
Write-Host "Option 2: Install UI-TARS Package" -ForegroundColor Cyan
Write-Host "This installs the official UI-TARS package if available." -ForegroundColor White
Write-Host ""
$installUITars = Read-Host "Install UI-TARS package? (y/n)"

if ($installUITars -eq "y") {
    Write-Host ""
    Write-Host "Installing UI-TARS..." -ForegroundColor Yellow
    try {
        pip install ui-tars
        Write-Host "✓ UI-TARS package installed!" -ForegroundColor Green
    } catch {
        Write-Host "⚠ UI-TARS package may not be available on PyPI" -ForegroundColor Yellow
        Write-Host "You may need to install from source or use vLLM instead." -ForegroundColor Yellow
    }
}

Write-Host ""

# Option 3: Install from requirements.txt (if exists)
$requirementsPath = "D:\fyp v3\Uitar\requirements.txt"
if (Test-Path $requirementsPath) {
    Write-Host "Option 3: Install from requirements.txt" -ForegroundColor Cyan
    Write-Host "Found requirements.txt at: $requirementsPath" -ForegroundColor White
    Write-Host ""
    $installRequirements = Read-Host "Install from requirements.txt? (y/n)"
    
    if ($installRequirements -eq "y") {
        Write-Host ""
        Write-Host "Installing from requirements.txt..." -ForegroundColor Yellow
        try {
            pip install -r $requirementsPath
            Write-Host "✓ Requirements installed successfully!" -ForegroundColor Green
        } catch {
            Write-Host "✗ Failed to install requirements" -ForegroundColor Red
            Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installation Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Start the UI-TARS server:" -ForegroundColor White
Write-Host "   .\scripts\start-ui-tars-server.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Or manually:" -ForegroundColor White
Write-Host "   python -m vllm.entrypoints.openai.api_server --model `"D:\fyp v3\Uitar\UI-TARS-1.5-7B`" --port 8000" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. Test the connection:" -ForegroundColor White
Write-Host "   .\scripts\test-ui-tars-connection.ps1" -ForegroundColor Cyan
Write-Host ""
