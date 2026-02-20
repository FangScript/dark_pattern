# Quick Start: Connect UI-TARS Model

## Problem
You're getting `ModuleNotFoundError: No module named 'vllm'` because you're using the wrong Python environment.

## Solution

### Option 1: Use the Current Virtual Environment (Recommended)

vLLM is already installed in your current Python environment. Just make sure you're using the correct Python:

```powershell
# From the dark-pattern-hunter folder (where you are now)
cd "D:\fyp v3\Uitar"

# Use the Python from your current venv
python -m vllm.entrypoints.openai.api_server --model "D:\fyp v3\Uitar\UI-TARS-1.5-7B" --port 8000
```

### Option 2: Use the Startup Script

The startup script will automatically check for vLLM and install it if needed:

```powershell
# From dark-pattern-hunter folder
.\scripts\start-ui-tars-server.ps1
```

### Option 3: Install vLLM in Current Environment

If vLLM is not in your current environment:

```powershell
# Activate your virtual environment (if not already active)
# The (.venv) prefix in your prompt means it's already active

# Install vLLM
pip install vllm

# Then start the server
cd "D:\fyp v3\Uitar"
python -m vllm.entrypoints.openai.api_server --model "D:\fyp v3\Uitar\UI-TARS-1.5-7B" --port 8000
```

## Verify Installation

Check if vLLM is installed:

```powershell
python -m pip show vllm
```

You should see:
```
Name: vllm
Version: 0.11.0
```

## Start the Server

**IMPORTANT:** vLLM requires `uvloop` which doesn't support Windows. Use the Windows-compatible script:

```powershell
# From dark-pattern-hunter folder
python scripts\run-ui-tars-windows.py `
    --model "D:\fyp v3\Uitar\UI-TARS-1.5-7B" `
    --port 8000 `
    --host localhost
```

Or use the PowerShell wrapper:

```powershell
.\scripts\start-ui-tars-server-windows.ps1
```

**Note:** The Windows script patches the `uvloop` import issue automatically.

## Test Connection

In another terminal, test the connection:

```powershell
# From dark-pattern-hunter folder
.\scripts\test-ui-tars-connection.ps1
```

Or manually:

```powershell
curl http://localhost:8000/v1/models
```

## Use in Extension

Once the server is running:

1. Open Chrome Extension
2. Go to "Dataset Collection" tab  
3. Click "Analyze Current Page"
4. The extension will connect to `http://localhost:8000/v1`

## Troubleshooting

### Port Already in Use
```powershell
# Find what's using port 8000
netstat -ano | findstr :8000

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

### Model Path Error
Ensure the model path is correct:
- Check: `D:\fyp v3\Uitar\UI-TARS-1.5-7B` exists
- Use absolute path with quotes: `"D:\fyp v3\Uitar\UI-TARS-1.5-7B"`

### CUDA/GPU Issues
vLLM requires CUDA for GPU acceleration. If you get CUDA errors:
- Install CUDA toolkit
- Or use CPU mode (slower): Add `--device cpu` flag

### Memory Issues
If you run out of memory:
- Use a smaller model
- Reduce batch size: `--max-num-batched-tokens 2048`
- Use CPU mode: `--device cpu`
