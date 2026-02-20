import logging
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

# Enable full logging to see download progress
logging.basicConfig(level=logging.INFO)

model_id = "Qwen/Qwen2.5-1.5B"

# Load tokenizer
tokenizer = AutoTokenizer.from_pretrained(model_id, cache_dir="./local_model")

# Load model
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    cache_dir="./local_model",  # local download folder
    torch_dtype=torch.float16,
    device_map="auto"
)

print("Model loaded successfully!")
