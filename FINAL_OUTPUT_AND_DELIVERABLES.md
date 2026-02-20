# Final Output & Deliverables: Dark Pattern Hunter FYP

## 🎯 Project Overview

**Project Type:** Final Year Project (FYP)  
**Focus:** Automated Dark Pattern Detection in Pakistani E-commerce Websites  
**Research Goal:** Build a comprehensive dataset and fine-tuned AI model for detecting manipulative UI patterns

---

## 📦 Final Deliverables

### 1. **Chrome Extension Application** ✅ (Primary Deliverable)

**What it is:**
A fully functional Chrome browser extension that automatically detects dark patterns on Pakistani e-commerce websites.

**Final Form:**
- **Installable Chrome Extension** (`.crx` or unpacked `dist/` folder)
- **User Interface:** React-based popup with Ant Design components
- **Features:**
  - Single page analysis
  - Batch URL processing
  - Full website recursive crawling
  - Pattern frequency statistics
  - Filter by pattern type
  - Data export (JSON, JSONL, ZIP)

**User Experience:**
```
1. User installs extension in Chrome
2. Navigates to Pakistani e-commerce site (e.g., daraz.pk)
3. Clicks extension icon → Opens popup
4. Clicks "Analyze Current Page" or "Batch Process (Auto Crawl)"
5. Extension captures screenshot + DOM
6. AI model analyzes page for dark patterns
7. Results displayed with:
   - Pattern types detected
   - Severity levels
   - Evidence/descriptions
   - Statistics dashboard
8. User can export data for research
```

**Technical Specifications:**
- **Platform:** Chrome Browser (Manifest V3)
- **Frontend:** React + TypeScript + Ant Design
- **Storage:** IndexedDB (local browser database)
- **AI Integration:** GPT-4o (Phase 1) → Fine-tuned UI-TARS (Phase 3)
- **Build Output:** `apps/chrome-extension/dist/` or packaged ZIP

**Installation:**
- Load unpacked extension from `dist/` folder
- Or install from packaged ZIP file
- Configure AI model API key in settings

---

### 2. **Research Dataset** 📊 (Core Research Output)

**What it is:**
A comprehensive dataset of Pakistani e-commerce pages with labeled dark patterns.

**Final Form - Three Export Formats:**

#### **A. Full JSON Dataset**
```json
[
  {
    "id": "entry-1234567890-abc123",
    "url": "https://www.daraz.pk/products/...",
    "timestamp": 1234567890,
    "screenshot": "data:image/png;base64,...",
    "dom": "<html>...</html>",
    "patterns": [
      {
        "type": "Pressured Selling / FOMO / Urgency",
        "description": "Countdown timer creating urgency",
        "severity": "high",
        "location": "Product card header",
        "evidence": "Timer: 'Only 2 hours left!'",
        "confidence": 0.92
      }
    ],
    "metadata": {
      "pageTitle": "Product Page - Daraz",
      "researchContext": {
        "isPakistaniEcommerce": true,
        "siteName": "Daraz",
        "modelUsed": "gpt-4o",
        "analysisVersion": "2.2"
      }
    },
    "summary": {
      "total_patterns": 3,
      "prevalence_score": 0.75,
      "primary_categories": ["Urgency", "Scarcity"]
    }
  }
]
```

**Size:** 200-500 pages (Phase 1), 1000+ pages (Phase 3)  
**Format:** JSON array file  
**Use Case:** Complete dataset with all metadata for analysis

#### **B. Text Dataset (JSONL) - For Training**
```
{"id":"entry-1#0","url":"https://...","pattern_type":"Urgency","severity":"high","evidence":"Timer: Only 2 hours left","description":"...","dom_excerpt":"..."}
{"id":"entry-1#1","url":"https://...","pattern_type":"Scarcity","severity":"medium","evidence":"Only 3 left in stock","description":"...","dom_excerpt":"..."}
{"id":"entry-2#0","url":"https://...","pattern_type":"Hidden Information","severity":"critical","evidence":"Shipping fee hidden until checkout","description":"...","dom_excerpt":"..."}
```

**Size:** One line per detected pattern (flattened)  
**Format:** JSONL (JSON Lines)  
**Use Case:** Training data for fine-tuning UI-TARS model

#### **C. Complete Bundle (ZIP)**
```
dark-pattern-dataset-2025-01-15.zip
├── manifest.json          # All entries metadata
├── processed.jsonl        # Flattened training data
└── images/
    ├── entry_1.png       # Screenshot 1
    ├── entry_2.png       # Screenshot 2
    └── ...               # All screenshots
```

**Size:** ~50-200 MB (depending on number of pages)  
**Format:** ZIP archive  
**Use Case:** Complete dataset with images for research paper/repository

**Dataset Statistics:**
- **Total Pages:** 200-1000+ (depending on collection phase)
- **Pattern Categories:** 13 types (Nagging, Urgency, Scarcity, etc.)
- **Languages:** English, Urdu (Perso-Arabic), Roman Urdu
- **Sites Covered:** Daraz.pk, OLX, Shophive, Telemart, etc.
- **Quality:** AI-validated (confidence > 0.7)

---

### 3. **Fine-Tuned AI Model** 🤖 (Research Contribution)

**What it is:**
A fine-tuned UI-TARS model specifically trained on Pakistani e-commerce dark patterns.

**Final Form:**
- **Model:** Fine-tuned UI-TARS checkpoint
- **Training Data:** Your collected JSONL dataset
- **Format:** Model weights/checkpoint files
- **Deployment:** Local server (http://localhost:8000/v1)

**Model Specifications:**
- **Base Model:** UI-TARS (open-source visual agent model)
- **Fine-tuning Method:** Supervised fine-tuning on dark pattern dataset
- **Input:** Screenshot + DOM + URL
- **Output:** JSON with detected patterns, severity, confidence
- **Performance:** Improved accuracy on Pakistani e-commerce patterns

**Usage:**
```typescript
// Configure extension to use fine-tuned model
const modelConfig = {
  modelName: "ui-tars-finetuned",
  openaiBaseURL: "http://localhost:8000/v1",
  // ... other config
};
```

**Deliverables:**
- Fine-tuned model checkpoint files
- Training script (`finetune_ui_tars.py`)
- Evaluation metrics (accuracy, precision, recall)
- Comparison with base UI-TARS and GPT-4o

---

### 4. **Research Documentation** 📝 (Academic Output)

**What it is:**
Complete documentation of your research methodology, findings, and contributions.

**Final Form - Multiple Documents:**

#### **A. Research Paper/Thesis**
- **Title:** "Automated Detection of Dark Patterns in Pakistani E-commerce Websites Using Visual Language Models"
- **Sections:**
  1. Abstract
  2. Introduction
  3. Literature Review
  4. Methodology
  5. Dataset Collection & Analysis
  6. Model Fine-tuning & Evaluation
  7. Results & Discussion
  8. Conclusion & Future Work
- **Format:** PDF (LaTeX/Word)
- **Length:** 30-50 pages (typical FYP)

#### **B. Technical Documentation**
- **Code Documentation:** JSDoc comments, README files
- **API Documentation:** Function signatures, usage examples
- **Architecture Diagrams:** System design, data flow
- **User Manual:** How to use the extension

#### **C. Evaluation Report**
- **Model Performance:**
  - Accuracy: X%
  - Precision: X%
  - Recall: X%
  - F1-Score: X%
- **Dataset Statistics:**
  - Total pages: X
  - Patterns detected: X
  - Prevalence rate: X%
  - Category breakdown
- **Comparison:**
  - GPT-4o vs. Base UI-TARS vs. Fine-tuned UI-TARS
  - Cost analysis
  - Speed comparison

---

### 5. **Source Code Repository** 💻 (Technical Deliverable)

**What it is:**
Complete, well-documented source code of the entire project.

**Final Form:**
- **Repository:** GitHub/GitLab repository
- **Structure:**
  ```
  dark-pattern-hunter/
  ├── apps/
  │   └── chrome-extension/     # Extension source code
  ├── packages/
  │   ├── core/                 # AI agent engine
  │   ├── shared/               # Shared utilities
  │   └── ...
  ├── docs/                     # Documentation
  ├── dataset/                  # Collected dataset (or link)
  ├── models/                   # Fine-tuned model (or link)
  ├── README.md                 # Project overview
  ├── LICENSE                   # MIT License
  └── package.json              # Dependencies
  ```

**Code Quality:**
- ✅ TypeScript (type-safe)
- ✅ Well-commented code
- ✅ Modular architecture
- ✅ Error handling
- ✅ Unit tests (if applicable)

**Documentation:**
- README with installation instructions
- API documentation
- Usage examples
- Contribution guidelines

---

### 6. **Evaluation Results** 📈 (Research Evidence)

**What it is:**
Quantitative and qualitative analysis of your system's performance.

**Final Form:**

#### **A. Performance Metrics**
```
Model Comparison:
┌─────────────────┬──────────┬──────────┬──────────────┐
│ Model           │ Accuracy │ Cost     │ Speed        │
├─────────────────┼──────────┼──────────┼──────────────┤
│ GPT-4o          │ 88%      │ $0.01/page│ 2-3 sec/page │
│ Base UI-TARS    │ 75%      │ $0       │ 1-2 sec/page │
│ Fine-tuned      │ 85%      │ $0       │ 1-2 sec/page │
│ UI-TARS         │          │          │              │
└─────────────────┴──────────┴──────────┴──────────────┘
```

#### **B. Dataset Analysis**
- **Pattern Distribution:**
  - Urgency: 45% of pages
  - Scarcity: 32% of pages
  - Hidden Information: 28% of pages
  - ...
- **Severity Breakdown:**
  - Critical: 15%
  - High: 35%
  - Medium: 40%
  - Low: 10%
- **Language Distribution:**
  - English: 60%
  - Urdu: 25%
  - Roman Urdu: 15%

#### **C. Case Studies**
- Detailed analysis of 5-10 specific dark pattern examples
- Before/after screenshots
- Impact on user experience
- Recommendations

---

## 🎓 Academic Deliverables Summary

### **For FYP Submission:**

1. ✅ **Working Application** (Chrome Extension)
   - Installable and functional
   - Demo video/screenshots
   - User manual

2. ✅ **Research Dataset**
   - 200-1000+ labeled pages
   - Multiple export formats
   - Dataset documentation

3. ✅ **Fine-tuned Model**
   - Trained model checkpoint
   - Training methodology
   - Evaluation results

4. ✅ **Research Paper/Thesis**
   - Complete written report
   - Methodology documentation
   - Results and analysis

5. ✅ **Source Code**
   - GitHub repository
   - Well-documented code
   - Installation instructions

6. ✅ **Presentation**
   - PowerPoint slides
   - Demo video
   - Q&A preparation

---

## 🚀 Final Application Form

### **As a Chrome Extension:**

**Installation:**
1. Build extension: `pnpm run build` in `apps/chrome-extension`
2. Load unpacked: Chrome → Extensions → Developer mode → Load unpacked → Select `dist/` folder
3. Configure: Click extension icon → Settings → Add API key

**Usage:**
1. Navigate to Pakistani e-commerce site
2. Click extension icon
3. Select "Dataset Collection" mode
4. Click "Analyze Current Page" or "Batch Process (Auto Crawl)"
5. View results in popup
6. Export data for research

**Features:**
- ✅ Real-time dark pattern detection
- ✅ Multi-language support (EN, Urdu, Roman Urdu)
- ✅ Pattern statistics and filtering
- ✅ Full website crawling
- ✅ Data export (JSON, JSONL, ZIP)

---

## 📊 Expected Outcomes

### **Research Contributions:**

1. **First comprehensive dataset** of Pakistani e-commerce dark patterns
2. **Fine-tuned model** specifically for Pakistani market
3. **Multi-language support** (English, Urdu, Roman Urdu)
4. **Automated detection system** (no manual labeling)
5. **Scalable methodology** for future research

### **Practical Applications:**

1. **Consumer Protection:** Help identify manipulative practices
2. **Regulatory Compliance:** Assist in auditing e-commerce sites
3. **Research Tool:** Enable further dark pattern research
4. **Educational Resource:** Teach about dark patterns

---

## 📅 Timeline & Phases

### **Phase 1: Data Collection (Current)**
- ✅ Extension built and functional
- 🔄 Collecting dataset with GPT-4o
- 📊 Target: 200-500 pages

### **Phase 2: Model Fine-tuning**
- 📝 Export JSONL dataset
- 🤖 Fine-tune UI-TARS model
- 📈 Evaluate performance

### **Phase 3: Deployment & Evaluation**
- 🚀 Deploy fine-tuned model
- 📊 Large-scale collection (1000+ pages)
- 📝 Write research paper

### **Phase 4: Submission**
- ✅ Finalize documentation
- 📹 Create demo video
- 🎓 Prepare presentation
- 📤 Submit FYP

---

## 🎯 Success Criteria

### **Technical:**
- ✅ Extension works on major Pakistani e-commerce sites
- ✅ Detects all 13 pattern categories
- ✅ Multi-language detection (EN, Urdu, Roman Urdu)
- ✅ Fine-tuned model accuracy > 80%

### **Research:**
- ✅ Dataset of 200+ labeled pages
- ✅ Comprehensive pattern analysis
- ✅ Model comparison (GPT-4o vs. UI-TARS)
- ✅ Publication-ready results

### **Academic:**
- ✅ Complete research paper
- ✅ Working demonstration
- ✅ Code repository
- ✅ Clear documentation

---

## 📦 Final Deliverables Checklist

- [x] Chrome Extension (built and tested)
- [ ] Research Dataset (200-1000+ pages)
- [ ] Fine-tuned UI-TARS Model
- [ ] Research Paper/Thesis (30-50 pages)
- [ ] Source Code Repository (GitHub)
- [ ] Evaluation Report (metrics and analysis)
- [ ] Demo Video (5-10 minutes)
- [ ] Presentation Slides (15-20 slides)
- [ ] User Manual
- [ ] Installation Guide

---

## 🎓 What Makes This FYP Strong

1. **Real-World Application:** Addresses actual problem (dark patterns in e-commerce)
2. **Technical Innovation:** Visual AI + fine-tuning approach
3. **Comprehensive Dataset:** First of its kind for Pakistani market
4. **Multi-language Support:** English, Urdu, Roman Urdu
5. **Fully Automated:** No manual labeling required
6. **Scalable:** Can be extended to other markets/languages
7. **Research Contribution:** Fine-tuned model for dark pattern detection
8. **Practical Tool:** Working Chrome extension

---

## 📝 Summary

**Your final output will be:**

1. **A working Chrome Extension** that automatically detects dark patterns
2. **A comprehensive research dataset** (200-1000+ pages) with labeled patterns
3. **A fine-tuned AI model** (UI-TARS) specifically for Pakistani e-commerce
4. **A complete research paper** documenting methodology and findings
5. **Source code repository** with full documentation
6. **Evaluation results** comparing different models and approaches

**This is a production-ready, research-grade system** that contributes to both academic research and practical consumer protection. Your FYP will demonstrate:
- Strong technical skills (AI, web development, data science)
- Research methodology (dataset creation, model fine-tuning)
- Real-world application (consumer protection)
- Innovation (multi-language support, automated detection)

**You're building something that matters!** 🚀

