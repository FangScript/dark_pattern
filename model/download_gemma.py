import os
from huggingface_hub import snapshot_download

def download_model():
    model_id = "google/gemma-3-4b-it"
    repo_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "local_model", "gemma-3-4b-it")
    os.makedirs(repo_dir, exist_ok=True)
    
    print(f"Downloading {model_id} to {repo_dir}...")
    try:
        path = snapshot_download(
            repo_id=model_id,
            local_dir=repo_dir,
            local_dir_use_symlinks=False,
            # optional if a token is needed:
            # token="hf_..."
        )
        print(f"Model downloaded successfully to {path}")
    except Exception as e:
        print(f"Error downloading model: {e}")

if __name__ == "__main__":
    download_model()
