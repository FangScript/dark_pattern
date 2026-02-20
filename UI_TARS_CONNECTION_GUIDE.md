# UI-TARS Model Connection Guide

This guide explains how to connect the UI-TARS model from the `Uitar` folder to the Dark Pattern Hunter Chrome Extension.

## Overview

The Chrome Extension is already configured to use UI-TARS via a local server. You need to:
1. Start a UI-TARS server on `localhost:8000`
2. Ensure it exposes an OpenAI-compatible API at `/v1/chat/completions`
3. The extension will automatically connect to it

## Current Configuration

The extension is configured in `apps/chrome-extension/src/extension/popup/index.tsx`:

```typescript
const uiTarsConfig: Record<string, string> = {
  [MIDSCENE_OPENAI_BASE_URL]: 'http://localhost:8000/v1',
  [MIDSCENE_OPENAI_API_KEY]: 'not-needed',
  [MIDSCENE_MODEL_NAME]: 'ui-tars-1.5-7b',
  [MIDSCENE_VL_MODE]: 'vlm-ui-tars',
};
```

## Setup Methods

### Method 1: Using vLLM (Recommended)

vLLM provides an OpenAI-compatible API server for running UI-TARS models.

#### Installation:

```powershell
# Navigate to Uitar folder
cd "D:\fyp v3\Uitar"

# Install vLLM
pip install vllm

# Install additional dependencies if needed
pip install -r requirements.txt
```

#### Start Server:

```powershell
# Start vLLM server with UI-TARS model
python -m vllm.entrypoints.openai.api_server `
    --model "D:\fyp v3\Uitar\UI-TARS-1.5-7B" `
    --port 8000 `
    --host localhost `
    --api-key "not-needed"
```

Or use the provided script:

```powershell
.\scripts\start-ui-tars-server.ps1
```

### Method 2: Using UI-TARS Official Server

If UI-TARS provides its own server implementation:

```powershell
cd "D:\fyp v3\Uitar"
python -m ui_tars.server --port 8000 --model-path "D:\fyp v3\Uitar\UI-TARS-1.5-7B"
```

### Method 3: Custom FastAPI Server

If you have a custom server implementation in `main.py`:

```powershell
cd "D:\fyp v3\Uitar"
python main.py --port 8000
```

Ensure your server implements the OpenAI Chat Completions API format:

**Endpoint:** `POST /v1/chat/completions`

**Request Format:**
```json
{
  "model": "ui-tars-1.5-7b",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,..."
          }
        },
        {
          "type": "text",
          "text": "Your prompt here"
        }
      ]
    }
  ],
  "temperature": 0.0,
  "max_tokens": 2048
}
```

**Response Format:**
```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "ui-tars-1.5-7b",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{\"patterns\": [...], \"summary\": {...}}"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 1000,
    "completion_tokens": 500,
    "total_tokens": 1500
  }
}
```

## Verification

### 1. Check Server is Running

Open browser and navigate to: `http://localhost:8000/v1/models`

You should see a list of available models including `ui-tars-1.5-7b`.

### 2. Test API Connection

```powershell
# Test the API endpoint
curl http://localhost:8000/v1/models
```

### 3. Test from Extension

1. Open Chrome Extension popup
2. Go to "Dataset Collection" tab
3. Click "Analyze Current Page"
4. Check browser console for connection status

## Troubleshooting

### Port Already in Use

If port 8000 is already in use:

```powershell
# Find process using port 8000
netstat -ano | findstr :8000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

Or change the port in the extension configuration.

### Model Not Found

Ensure the model path is correct:
- Check: `D:\fyp v3\Uitar\UI-TARS-1.5-7B` exists
- Verify model files are present (checkpoint files, config files, etc.)

### API Format Mismatch

The extension expects OpenAI-compatible API. Ensure your server:
- Exposes `/v1/chat/completions` endpoint
- Accepts `messages` array with `image_url` and `text` content types
- Returns JSON in OpenAI format
- Supports vision (multimodal) inputs

### Connection Refused

1. Check firewall settings
2. Ensure server is binding to `localhost` (127.0.0.1), not just `0.0.0.0`
3. Verify port 8000 is not blocked

## Model Configuration

The extension uses these settings for UI-TARS:

- **Base URL:** `http://localhost:8000/v1`
- **Model Name:** `ui-tars-1.5-7b`
- **Vision Mode:** `vlm-ui-tars`
- **Temperature:** `0.0` (for UI-TARS)
- **Max Tokens:** `2048` (configurable)

## Next Steps

Once the server is running:

1. ✅ Server starts successfully on port 8000
2. ✅ Extension detects the server (check console logs)
3. ✅ Test with "Analyze Current Page" feature
4. ✅ Verify patterns are detected correctly
5. ✅ Check bounding boxes are returned properly

## Additional Resources

- UI-TARS Documentation: Check `D:\fyp v3\Uitar` for README files
- vLLM Documentation: https://docs.vllm.ai/
- OpenAI API Reference: https://platform.openai.com/docs/api-reference
