#!/usr/bin/env python
"""
Windows-compatible UI-TARS Server Launcher
Patches uvloop import issue for Windows compatibility
"""

import sys
import os

# Mock uvloop for Windows BEFORE vLLM imports it
class MockUvloop:
    """Mock uvloop module for Windows compatibility"""
    @staticmethod
    def install():
        """No-op for Windows"""
        pass

# Create mock module before any vLLM imports
import types
uvloop_module = types.ModuleType('uvloop')
uvloop_module.install = MockUvloop.install
sys.modules['uvloop'] = uvloop_module

# Now we can safely import vLLM
try:
    from vllm.entrypoints.openai.api_server import main
except ImportError as e:
    print(f"ERROR: Failed to import vLLM: {e}")
    print("\nPlease ensure vLLM is installed:")
    print("  pip install vllm")
    sys.exit(1)

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="UI-TARS Server (Windows-compatible)")
    parser.add_argument("--model", required=True, help="Path to UI-TARS model")
    parser.add_argument("--port", type=int, default=8000, help="Server port")
    parser.add_argument("--host", default="localhost", help="Server host")
    parser.add_argument("--api-key", default="not-needed", help="API key (not used for local)")
    
    args = parser.parse_args()
    
    print("=" * 50)
    print("UI-TARS Server (Windows-Compatible)")
    print("=" * 50)
    print(f"Model: {args.model}")
    print(f"Server: http://{args.host}:{args.port}/v1")
    print("Note: Using uvloop compatibility patch for Windows")
    print("=" * 50)
    print()
    
    # Set up sys.argv for vLLM's main function
    sys.argv = [
        "vllm.entrypoints.openai.api_server",
        "--model", args.model,
        "--port", str(args.port),
        "--host", args.host,
        "--api-key", args.api_key
    ]
    
    # Run vLLM server
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nServer stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"\nERROR: Server failed to start: {e}")
        sys.exit(1)
