import argparse
import subprocess
import sys
from pathlib import Path


def run_command(command: list[str]) -> None:
    print("Running:", " ".join(command))
    subprocess.run(command, check=True)


def resolve_quantize_binary(llama_cpp_dir: Path) -> Path:
    candidates = [
        llama_cpp_dir / "build" / "bin" / "quantize.exe",
        llama_cpp_dir / "build" / "bin" / "llama-quantize.exe",
        llama_cpp_dir / "quantize.exe",
        llama_cpp_dir / "llama-quantize.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "Could not find quantize binary in llama.cpp. Build llama.cpp first."
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert an HF Gemma model to GGUF for LM Studio."
    )
    parser.add_argument(
        "--hf-model-dir",
        required=True,
        help="Path to downloaded HF model directory (from download_gemma.py output).",
    )
    parser.add_argument(
        "--llama-cpp-dir",
        required=True,
        help="Path to local llama.cpp directory.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(Path(__file__).resolve().parent / "exports" / "gguf"),
        help="Folder to write GGUF outputs.",
    )
    parser.add_argument(
        "--quant-type",
        default="Q4_K_M",
        help="Quantization type for weak laptops (default: Q4_K_M).",
    )
    args = parser.parse_args()

    hf_model_dir = Path(args.hf_model_dir).resolve()
    llama_cpp_dir = Path(args.llama_cpp_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if not hf_model_dir.exists():
        raise FileNotFoundError(f"HF model directory not found: {hf_model_dir}")

    convert_script = llama_cpp_dir / "convert_hf_to_gguf.py"
    if not convert_script.exists():
        raise FileNotFoundError(
            f"convert_hf_to_gguf.py not found in llama.cpp directory: {llama_cpp_dir}"
        )

    model_name = hf_model_dir.name
    f16_out = output_dir / f"{model_name}-f16.gguf"
    quant_out = output_dir / f"{model_name}-{args.quant_type}.gguf"

    run_command(
        [
            sys.executable,
            str(convert_script),
            str(hf_model_dir),
            "--outfile",
            str(f16_out),
            "--outtype",
            "f16",
        ]
    )

    quantize_binary = resolve_quantize_binary(llama_cpp_dir)
    run_command(
        [
            str(quantize_binary),
            str(f16_out),
            str(quant_out),
            args.quant_type,
        ]
    )

    print()
    print("GGUF export complete.")
    print(f"Fine-tuning source (HF format): {hf_model_dir}")
    print(f"LM Studio file (GGUF): {quant_out}")


if __name__ == "__main__":
    main()
