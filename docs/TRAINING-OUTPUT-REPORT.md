# Training Output Report (Current Workspace Snapshot)

## Scope

This report lists all currently available fine-tuning outputs under `model/finetune`, plus dataset statistics and metric availability status.

## 1) Fine-Tuning Code and Config Files

Present files:

- `model/finetune/config.yaml`
- `model/finetune/train_gemma.py`
- `model/finetune/prepare_dataset.py`
- `model/finetune/requirements_finetune.txt`
- `model/finetune/evaluate_gemma.py`

## 2) Prepared Dataset Files

Present files:

- `model/finetune/data/train.jsonl`
- `model/finetune/data/val.jsonl`
- `model/finetune/data/test.jsonl`

Observed split statistics:

- `train.jsonl`: 723 samples (`396 clean`, `327 dark_pattern`, avg `num_patterns=0.8119`)
- `val.jsonl`: 90 samples (`56 clean`, `34 dark_pattern`, avg `num_patterns=0.6111`)
- `test.jsonl`: 91 samples (`56 clean`, `35 dark_pattern`, avg `num_patterns=0.7473`)

## 3) Training Artifacts Produced

Two adapter output directories exist:

- `model/finetune/output/gemma-darkpattern-lora/final_adapter`
- `model/finetune/output/gemma-darkpattern-lora-clean-full/final_adapter`

Each contains:

- `adapter_model.safetensors`
- `adapter_config.json`
- `tokenizer.json`
- `tokenizer_config.json`
- `processor_config.json`
- `chat_template.jinja`
- `README.md`

## 4) Missing Training Logs / Checkpoints

Not found in current output tree:

- `trainer_state.json`
- checkpoint folders (e.g., `checkpoint-*`)
- `runs/` TensorBoard event files
- `results.csv` / persisted eval-loss history

Reason from config (`model/finetune/config.yaml`):

- `eval_strategy: "no"`
- `save_strategy: "no"`
- `report_to: "none"`

This setup saves final adapters but not full training/eval history artifacts.

## 5) Real Model Metric Reports

### 5.1 Real safe evaluation (model inference, low load)

Generated file:

- `model/finetune/output/evaluation_test_metrics_safe5.json`

Scope:

- Split: `test.jsonl`
- Evaluated samples: `5`
- Prediction source: **actual model output** from `evaluate_gemma.py`

Results:

- Confusion matrix (rows=true, cols=pred): `[[3, 0], [1, 1]]`
- Accuracy: `0.8000`
- F1 (`clean`): `0.8571`
- F1 (`dark_pattern`): `0.6667`
- Macro-F1: `0.7619`
- Weighted-F1: `0.7810`

### 5.2 Real safe evaluation (15 samples)

Generated file:

- `model/finetune/output/evaluation_test_metrics_safe15.json`

Scope:

- Split: `test.jsonl`
- Evaluated samples: `15`
- Prediction source: **actual model output** from `evaluate_gemma.py`

Results:

- Confusion matrix (rows=true, cols=pred): `[[8, 1], [3, 3]]`
- Accuracy: `0.7333`
- F1 (`clean`): `0.8000`
- F1 (`dark_pattern`): `0.6000`
- Macro-F1: `0.7000`
- Weighted-F1: `0.7200`

### 5.3 Non-thesis proxy metric (not model inference)

Generated file:

- `model/finetune/output/train_metrics_all_samples.json`

This file is a dataset-rule consistency check (`num_patterns > 0`), not a true VLM benchmark. It should not be cited as final thesis model performance.

### 5.4 Logit-mode evaluation (thesis-primary protocol)

**Recommended** for reporting classifier performance: `evaluate_gemma.py --mode logit` (this is the script default).

- **Scoring:** Teacher-forced **negative mean NLL** on the continuation tokens for `" clean"` vs `" dark_pattern"`, using HuggingFace `labels=` (same family of objective as causal LM training). All processor outputs (e.g. `pixel_values`, `image_grid_thw`) are forwarded to the model.
- **Why not manual logits slicing:** An earlier variant summed log-probs from raw `logits` slices; for Gemma 3 multimodal inputs that can misalign or stall; the `labels=` path is the robust choice.

**Full test split (91 samples)** — run locally and save:

```powershell
cd model\finetune
& "..\..\model\.venv_gemma\Scripts\python.exe" .\evaluate_gemma.py --config .\config.yaml --split test --mode logit --save-json .\output\evaluation_test_metrics_logit_full91.json
```

After the run completes, the JSON includes `eval_mode`, `logit_scoring`, confusion matrix, and sklearn `classification_report` fields.

**Note:** `evaluation_test_metrics_logit_full91.json` was not present in the repo snapshot at the time of this doc update; populate it by running the command above (a prior long run had only finished weight load before the evaluator was fixed).

### 5.5 Full-test generation run caveat (`max_new_tokens` too small)

Generated file:

- `model/finetune/output/evaluation_test_metrics_safe100.json`

This run used **all 91 test samples** but with **generation** and an effective **very short** decode budget (`max_new_tokens=1`), which **collapsed** predictions (e.g. almost all `dark_pattern`). **Do not cite** these numbers as fair classifier accuracy; use **logit mode** (§5.4) or generation with enough tokens (e.g. 16–80) for a meaningful decode.

## 6) Research-Ready Documentation

Detailed methodology and reproducibility notes are documented in:

- `docs/RESEARCH-FINETUNE-DATASET-MODEL.md`

This includes:

- model requirement details,
- dataset composition,
- fine-tune configuration,
- evaluation protocol and command templates,
- reporting checklist.
