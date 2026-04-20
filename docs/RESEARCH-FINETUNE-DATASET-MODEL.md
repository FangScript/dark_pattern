# Dark Pattern Research: Dataset, Model, Fine-Tuning, and Metrics

## 1) Research Objective

This project fine-tunes a multimodal VLM to classify dark-pattern presence from webpage screenshots and textual prompts, then reports reproducible evaluation metrics for research use.

Primary binary labels:

- `clean`: no dark pattern present
- `dark_pattern`: one or more dark patterns present

## 2) Required Model and Environment

### Base model

- Base checkpoint: `model/gemma-3-4b-it`
- Fine-tuning method: QLoRA (4-bit quantized base + LoRA adapters)
- Final adapter path (current run): `model/finetune/output/gemma-darkpattern-lora-clean-full/final_adapter`

### Python environment

Recommended environment:

- `model/.venv_gemma/Scripts/python.exe` (Windows)

Core dependencies are listed in `model/finetune/requirements_finetune.txt`, including:

- `torch`, `transformers`, `peft`, `trl`, `datasets`, `Pillow`, `PyYAML`, `scikit-learn`

### Hardware requirements (practical)

- Minimum: CUDA GPU recommended for evaluation/training speed
- For Gemma 3 4B multimodal, CPU-only execution is possible but very slow
- QLoRA training assumes bitsandbytes and CUDA-compatible setup

## 3) Dataset Used for Fine-Tuning

Prepared supervised JSONL files:

- `model/finetune/data/train.jsonl`
- `model/finetune/data/val.jsonl`
- `model/finetune/data/test.jsonl`

Data comes from:

- Positive dark-pattern annotations (YOLO + extension-manifest exports)
- Negative clean UI screens from UI-elements dataset

Configured in `model/finetune/config.yaml`:

- Train/Val/Test split: `0.80 / 0.10 / 0.10`
- Negative ratio: `2.0`
- Seed: `42`

### Current dataset composition (from JSONL files)

- Train: `723` samples (`396 clean`, `327 dark_pattern`)
- Val: `90` samples (`56 clean`, `34 dark_pattern`)
- Test: `91` samples (`56 clean`, `35 dark_pattern`)

## 4) Fine-Tuning Configuration (Current)

Source: `model/finetune/config.yaml`

- LoRA rank `r=16`, alpha `32`, dropout `0.05`
- Target modules: `q_proj`, `k_proj`, `v_proj`, `o_proj`, `gate_proj`, `up_proj`, `down_proj`
- Epochs: `1`
- Batch size: `1` (gradient accumulation `2`)
- Learning rate: `2e-4`, scheduler: cosine, warmup ratio: `0.03`
- Mixed precision: `bf16=true` (GPU path)

Important current limitation:

- `eval_strategy: "no"` and `save_strategy: "no"` in training config
- This means training does not save eval loss/checkpoint metrics automatically

## 5) Evaluation Script and Metric Matrix

Evaluation script added:

- `model/finetune/evaluate_gemma.py`

What it reports:

- Confusion matrix (rows=true, cols=pred)
- Accuracy
- Precision / Recall / F1 per class
- Macro-F1 and Weighted-F1
- Optional machine-readable JSON output

### Reproducible command

**Thesis-primary evaluation** uses `--mode logit` (default): teacher-forced scoring of continuations `" clean"` vs `" dark_pattern"` via HuggingFace `labels=` (mean NLL over continuation tokens). This avoids brittle free-form generation parsing and unstable settings such as `max_new_tokens=1`.

From `model/finetune`:

```powershell
& "D:\FYP-main (1)\FYP-main\model\.venv_gemma\Scripts\python.exe" .\evaluate_gemma.py --config .\config.yaml --split test --mode logit --save-json .\output\evaluation_test_metrics_logit_full91.json
```

Optional bounded run (faster sanity check):

```powershell
& "D:\FYP-main (1)\FYP-main\model\.venv_gemma\Scripts\python.exe" .\evaluate_gemma.py --config .\config.yaml --split test --mode logit --max-samples 15 --save-json .\output\evaluation_test_metrics_logit_15.json
```

Free-form generation (for qualitative inspection only; parsing can fail):

```powershell
& "D:\FYP-main (1)\FYP-main\model\.venv_gemma\Scripts\python.exe" .\evaluate_gemma.py --config .\config.yaml --split test --mode generate --max-new-tokens 80 --save-json .\output\evaluation_test_metrics_gen_30.json
```

### Metric matrix format

Confusion matrix label order is:

`[clean, dark_pattern]`

Matrix layout:

```text
[[TN_clean, FP_clean_to_dark],
 [FN_dark_to_clean, TP_dark]]
```

Where:

- Row 1: true `clean`
- Row 2: true `dark_pattern`
- Col 1: predicted `clean`
- Col 2: predicted `dark_pattern`

## 6) Research Reporting Checklist

When publishing results, report:

1. Dataset split counts and label balance
2. Exact base model and adapter path
3. Fine-tuning hyperparameters from config
4. Evaluation split and sample count
5. Confusion matrix + per-class precision/recall/F1
6. Macro-F1 and weighted-F1
7. Any evaluation-time constraints (max samples, max tokens)

## 7) Recommended Upgrade for Stronger Research Rigor

For future runs, enable training-time validation logging in `config.yaml`:

- `eval_strategy: "epoch"`
- `save_strategy: "epoch"`
- optionally `report_to: "wandb"` (or TensorBoard)

This will persist evaluation curves and best-checkpoint selection artifacts, improving reproducibility and paper-quality reporting.
