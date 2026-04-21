# Gemma Export Workflow (HF + LM Studio)

This setup keeps two outputs:

- **HF format** for future fine-tuning (`exports/hf/...`)
- **GGUF format** for LM Studio (`exports/gguf/...`)

## 1) Download HF model (fine-tuning copy)

```bash
python download_gemma.py --model-id google/gemma-3-4b-it
```

Output example:

- `exports/hf/google--gemma-3-4b-it/`

This folder keeps `config.json`, tokenizer files, and model weights for later training/fine-tuning pipelines.

## 2) Convert to GGUF for LM Studio

First, make sure `llama.cpp` is cloned and built on your system.

```bash
python export_gemma_gguf.py ^
  --hf-model-dir "D:\FYP-main (1)\FYP-main\model\exports\hf\google--gemma-3-4b-it" ^
  --llama-cpp-dir "D:\path\to\llama.cpp" ^
  --quant-type Q4_K_M
```

Output example:

- `exports/gguf/google--gemma-3-4b-it-f16.gguf`
- `exports/gguf/google--gemma-3-4b-it-Q4_K_M.gguf`  <-- use this in LM Studio

## Recommended quantization

- `Q4_K_M` for weaker laptops (best balance)
- `Q5_K_M` if hardware can handle a little more RAM/latency

## Upload to Hugging Face

Create a model repo and upload:

- The HF folder (`exports/hf/...`) for fine-tuning continuity
- The quantized GGUF file (`exports/gguf/...-Q4_K_M.gguf`) for LM Studio users

Keeping both formats in the same repo (or separate repos) is fine.
