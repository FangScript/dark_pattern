# Test UI-TARS Server Connection
# This script verifies that the UI-TARS server is running and accessible

param(
    [string]$ServerUrl = "http://localhost:8000/v1"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "UI-TARS Connection Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check if server is running
Write-Host "Test 1: Checking server availability..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$ServerUrl/models" -Method GET -ErrorAction Stop
    Write-Host "✓ Server is running!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Cyan
    Write-Host ($response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 3)
    Write-Host ""
} catch {
    Write-Host "✗ Server is NOT running or not accessible" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start the UI-TARS server first:" -ForegroundColor Yellow
    Write-Host "  .\scripts\start-ui-tars-server.ps1" -ForegroundColor White
    exit 1
}

# Test 2: Check if model is available
Write-Host "Test 2: Checking available models..." -ForegroundColor Yellow
try {
    $modelsResponse = Invoke-RestMethod -Uri "$ServerUrl/models" -Method GET
    $modelNames = $modelsResponse.data | ForEach-Object { $_.id }
    
    if ($modelNames -contains "ui-tars-1.5-7b") {
        Write-Host "✓ Model 'ui-tars-1.5-7b' is available!" -ForegroundColor Green
    } else {
        Write-Host "⚠ Model 'ui-tars-1.5-7b' not found in available models" -ForegroundColor Yellow
        Write-Host "Available models: $($modelNames -join ', ')" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Note: The extension will use the first available model if exact name doesn't match" -ForegroundColor Yellow
    }
    Write-Host ""
} catch {
    Write-Host "✗ Could not retrieve model list" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 3: Test a simple chat completion (if possible)
Write-Host "Test 3: Testing API endpoint..." -ForegroundColor Yellow
try {
    $testPayload = @{
        model = "ui-tars-1.5-7b"
        messages = @(
            @{
                role = "user"
                content = "Hello, this is a test message."
            }
        )
        max_tokens = 50
        temperature = 0.0
    } | ConvertTo-Json -Depth 10

    Write-Host "Sending test request..." -ForegroundColor Cyan
    $chatResponse = Invoke-RestMethod -Uri "$ServerUrl/chat/completions" -Method POST -Body $testPayload -ContentType "application/json"
    
    Write-Host "✓ API endpoint is working!" -ForegroundColor Green
    Write-Host "Response preview:" -ForegroundColor Cyan
    $responseContent = $chatResponse.choices[0].message.content
    if ($responseContent.Length -gt 100) {
        Write-Host $responseContent.Substring(0, 100) + "..."
    } else {
        Write-Host $responseContent
    }
    Write-Host ""
} catch {
    Write-Host "✗ API endpoint test failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "This might be normal if:" -ForegroundColor Yellow
    Write-Host "  - The model requires vision input (images)" -ForegroundColor White
    Write-Host "  - The server has specific requirements" -ForegroundColor White
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Connection test complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "If all tests passed, the extension should be able to connect." -ForegroundColor Green
Write-Host "Open the Chrome Extension and try 'Analyze Current Page' to verify." -ForegroundColor Cyan
