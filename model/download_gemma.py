import argparse
import os
from pathlib import Path

from huggingface_hub import snapshot_download


def download_model(model_id: str, output_dir: Path, token: str | None = None) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {model_id} to {output_dir} ...")

    path = snapshot_download(
        repo_id=model_id,
        local_dir=str(output_dir),
        local_dir_use_symlinks=False,
        token=token,
    )
    print(f"Model downloaded successfully to {path}")
    return Path(path)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download a Gemma model in Hugging Face format for future fine-tuning."
    )
    parser.add_argument(
        "--model-id",
        default="google/gemma-3-4b-it",
        help="Hugging Face model id (default: google/gemma-3-4b-it)",
    )
    parser.add_argument(
        "--output-root",
        default=str(Path(__file__).resolve().parent / "exports" / "hf"),
        help="Root folder where HF-format model is stored",
    )
    parser.add_argument(
        "--token",
        default=None,
        help="Optional HF token for gated models",
    )
    args = parser.parse_args()

    model_slug = args.model_id.replace("/", "--")
    model_dir = Path(args.output_root) / model_slug

    try:
        download_model(args.model_id, model_dir, args.token)
        print("HF-format model is ready for future fine-tuning workflows.")
    except Exception as exc:
        print(f"Error downloading model: {exc}")
        raise


if __name__ == "__main__":
    main()
