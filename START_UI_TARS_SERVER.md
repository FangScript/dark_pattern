# Start UI-TARS Server - Quick Guide

## The Problem
- vLLM is installed in **system Python**, not in the `.venv` virtual environment
- The venv Python doesn't have vLLM or has build issues

## Solution: Use System Python

### Method 1: Use the Simple Script (Recommended)

```powershell
# From dark-pattern-hunter folder
.\scripts\start-ui-tars-simple.ps1
```

This script automatically finds the Python with vLLM installed.

### Method 2: Use System Python Directly

```powershell
# From dark-pattern-hunter folder
C:\Users\HOME\AppData\Local\Programs\Python\Python310\python.exe `
    scripts\run-ui-tars-windows.py `
    --model "D:\fyp v3\Uitar\UI-TARS-1.5-7B" `
    --port 8000 `
    --host localhost
```

### Method 3: Install vLLM in Current Venv (Alternative)

If you want to use the venv Python:

```powershell
# Activate venv (if not already)
.\.venv\Scripts\Activate.ps1

# Install vLLM (this may take time and requires CUDA/build tools)
pip install vllm

# Then run
python scripts\run-ui-tars-windows.py --model "D:\fyp v3\Uitar\UI-TARS-1.5-7B" --port 8000
```

**Note:** Installing vLLM in venv may fail on Windows due to CUDA/build requirements.

## Verify Server is Running

Once started, test the connection:

```powershell
# In another terminal
curl http://localhost:8000/v1/models
```

Or use the test script:

```powershell
.\scripts\test-ui-tars-connection.ps1
```

## Use in Extension

Once the server is running:

1. Open Chrome Extension
2. Go to "Dataset Collection" tab
3. Click "Analyze Current Page"
4. Extension will connect to `http://localhost:8000/v1`

## Troubleshooting

### Port Already in Use
```powershell
# Find what's using port 8000
netstat -ano | findstr :8000

# Kill the process
taskkill /PID <PID> /F
```

### Model Path Error
Ensure the model path is correct and exists:
```powershell
Test-Path "D:\fyp v3\Uitar\UI-TARS-1.5-7B"
```

### vLLM Import Error
If you get `No module named 'vllm._C'`, it means vLLM wasn't built properly. Use the system Python instead.
