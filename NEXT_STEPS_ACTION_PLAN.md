# 🎯 Next Steps Action Plan: Data Collection & Fine-Tuning Preparation

## 📊 **Current Status: Phase 1 - GPT-4o Data Collection**

You're currently collecting high-quality dataset with GPT-4o. Here's your optimized roadmap:

---

## ✅ **IMMEDIATE NEXT STEPS (This Week)**

### **Step 1: Optimize Your Data Collection Strategy**

#### **1.1 Target Pakistani E-commerce Sites**

**Priority Sites to Collect:**
- ✅ **Major Platforms**: Daraz, OLX, Shophive, Telemart, HomeShopping
- ✅ **Niche Sites**: Foodpanda, Careem, Bykea, JazzCash, EasyPaisa
- ✅ **Diverse Pages**: Homepage, Product pages, Checkout, Cart, Account pages

**Collection Strategy:**
```
Week 1-2: Collect 200-300 pages
  ├─ 50% Homepage/Product pages
  ├─ 30% Checkout/Cart flows
  └─ 20% Account/Settings pages
```

#### **1.2 Use Batch Processing Features**

**In your extension:**
1. Click **"Batch Process (Auto Crawl)"** on a Pakistani e-commerce homepage
2. This automatically discovers all internal links
3. Processes them one by one
4. Saves time vs manual clicking

**Or Manual Batch:**
1. Prepare a list of URLs (one per line)
2. Click **"Batch Process (Manual URLs)"**
3. Paste your URL list
4. Let it process automatically

#### **1.3 Focus on Quality Over Quantity**

**What to Collect:**
- ✅ Pages with **multiple dark patterns** (better training data)
- ✅ Pages with **Urdu/Roman Urdu** text (critical for your research)
- ✅ Pages with **different pattern types** (balanced dataset)
- ✅ Pages with **high confidence scores** (>0.8)

**What to Skip:**
- ❌ Pages with 0 patterns (not useful for training)
- ❌ Pages with only low-confidence patterns (<0.7)
- ❌ Duplicate pages (same site, same layout)

---

### **Step 2: Monitor Data Quality**

#### **2.1 Check Statistics Dashboard**

Your extension shows:
- **Websites Scanned**: Target 200-500 pages
- **Patterns Found**: Should be 1-5 patterns per page on average
- **Prevalence Rate**: Should be 60-80% (pages with patterns)
- **PK E-commerce**: Should match your target sites

#### **2.2 Review Pattern Distribution**

**Ideal Distribution:**
```
Urgency Patterns:     25-30%
Scarcity Patterns:    20-25%
Social Proof:         15-20%
Forced Action:        10-15%
Misdirection:         10-15%
Obstruction:          5-10%
```

**If unbalanced:**
- Focus collection on underrepresented categories
- Use specific URLs that likely have those patterns

#### **2.3 Validate Urdu/Roman Urdu Detection**

**Check:**
- Are Urdu patterns being detected? (Look for "Urdu text" in evidence)
- Are Roman Urdu patterns being detected? (Look for "Jaldi karein", etc.)
- If not, the prompt is working but may need more examples

---

### **Step 3: Regular Data Export & Backup**

#### **3.1 Export Weekly**

**Every week, export:**
1. Click **"Export Bundle (ZIP)"** - This includes:
   - All screenshots (images/)
   - Full dataset (manifest.json)
   - Processed JSONL (processed.jsonl)

2. Save with date: `dark-patterns-dataset-2024-01-15.zip`

**Why:**
- ✅ Backup your progress
- ✅ Can analyze dataset quality
- ✅ Prepare for fine-tuning later

#### **3.2 Export Text Dataset for Analysis**

**For quick analysis:**
1. Click **"Export Text Dataset (JSONL)"**
2. This creates a lightweight file for analysis
3. Use for:
   - Pattern distribution analysis
   - Quality checks
   - Statistics

---

## 📈 **WEEK 2-3: Data Collection Optimization**

### **Step 4: Enhance Collection Efficiency**

#### **4.1 Create URL Lists by Category**

**Create text files with URLs:**

**urgency-patterns.txt:**
```
https://www.daraz.pk/flash-sale
https://www.shophive.com/deals
https://www.telemart.pk/sale
```

**scarcity-patterns.txt:**
```
https://www.daraz.pk/product/xyz
https://www.olx.pk/item/abc
```

**Batch process each file separately** to ensure balanced dataset.

#### **4.2 Use Auto Crawl Strategically**

**Best Practice:**
1. Start on homepage of major site (Daraz, OLX)
2. Click **"Batch Process (Auto Crawl)"**
3. Let it discover 50-100 internal pages
4. Review results, delete low-quality entries
5. Repeat for different sites

#### **4.3 Monitor API Costs**

**GPT-4o Vision Pricing:**
- ~$0.01-0.03 per page analysis
- 200 pages = $2-6
- 500 pages = $5-15

**Tips to Save:**
- ✅ Skip pages with obvious 0 patterns (preview first)
- ✅ Focus on pages likely to have patterns
- ✅ Use batch processing (more efficient)

---

## 🔍 **WEEK 3-4: Data Quality Assurance**

### **Step 5: Validate Dataset Quality**

#### **5.1 Manual Review Sample**

**Review 10-20 random entries:**
- ✅ Are patterns correctly identified?
- ✅ Are Urdu/Roman Urdu patterns detected?
- ✅ Are confidence scores reasonable?
- ✅ Are descriptions clear and accurate?

**If issues found:**
- Note common problems
- May need prompt refinement (but current prompt is good)

#### **5.2 Check for Data Balance**

**Export dataset and analyze:**

```python
# Quick analysis script (optional)
import json

with open('dark-patterns-dataset.json', 'r') as f:
    data = json.load(f)

pattern_types = {}
for entry in data:
    for pattern in entry['patterns']:
        pattern_types[pattern['type']] = pattern_types.get(pattern['type'], 0) + 1

print("Pattern Distribution:")
for ptype, count in sorted(pattern_types.items(), key=lambda x: x[1], reverse=True):
    print(f"  {ptype}: {count}")
```

**Target:**
- Each category should have 30-100 examples minimum
- If unbalanced, collect more of missing categories

#### **5.3 Check Urdu/Roman Urdu Coverage**

**Search exported dataset for:**
- Urdu text (Perso-Arabic): "جلدی", "آخری", etc.
- Roman Urdu: "Jaldi", "Aakhri", "Fori", etc.

**Target:**
- At least 30-40% of patterns should have Urdu/Roman Urdu evidence
- If lower, focus collection on Urdu-heavy pages

---

## 🎓 **PREPARING FOR UI-TARS FINE-TUNING (Week 4-5)**

### **Step 6: Prepare Dataset for Fine-Tuning**

#### **6.1 Export Final Dataset**

**When you have 200-500 quality pages:**
1. Click **"Export Bundle (ZIP)"**
2. This creates complete dataset with:
   - Screenshots (for visual training)
   - DOM excerpts (for context)
   - Pattern annotations (labels)
   - Metadata (for filtering)

#### **6.2 Convert to UI-TARS Training Format**

**UI-TARS needs:**
- **Images**: Screenshots (you have these ✅)
- **Labels**: Pattern types + bounding boxes (you have these ✅)
- **Context**: DOM + metadata (you have these ✅)

**Format Example:**
```json
{
  "image": "base64_screenshot",
  "prompt": "Detect dark patterns in this Pakistani e-commerce page",
  "response": {
    "patterns": [
      {
        "type": "urgency",
        "bbox": [x, y, width, height],
        "description": "...",
        "severity": "high"
      }
    ]
  }
}
```

#### **6.3 Split Dataset**

**Recommended Split:**
- **Training**: 80% (160-400 pages)
- **Validation**: 10% (20-50 pages)
- **Test**: 10% (20-50 pages)

**Split by:**
- Different websites (don't mix same site across splits)
- Different pattern types (balanced in each split)

---

## 🚀 **UI-TARS FINE-TUNING PREPARATION**

### **Step 7: Set Up UI-TARS Environment**

#### **7.1 Install UI-TARS**

```bash
# Follow UI-TARS official guide
git clone https://github.com/bytedance/ui-tars
cd ui-tars

# Install dependencies
pip install -r requirements.txt

# Download base model
# (Follow UI-TARS documentation)
```

#### **7.2 Prepare Training Data**

**You'll need to:**
1. Convert your dataset to UI-TARS format
2. Extract bounding boxes for patterns (if available)
3. Create training/validation/test splits

**Script to convert (you'll create this):**
```python
# convert_dataset.py (example)
import json
import base64

def convert_to_ui_tars_format(dataset_entry):
    return {
        "image": dataset_entry['screenshot'],
        "prompt": "Identify dark patterns in this Pakistani e-commerce page...",
        "response": {
            "patterns": [
                {
                    "type": p['type'],
                    "bbox": p.get('bbox', None),
                    "description": p['description'],
                    "severity": p['severity']
                }
                for p in dataset_entry['patterns']
            ]
        }
    }
```

#### **7.3 Fine-Tuning Process**

**Steps:**
1. Load UI-TARS base model
2. Load your converted dataset
3. Fine-tune on your data
4. Validate on test set
5. Compare with GPT-4o results

**Expected Results:**
- **Before Fine-Tuning**: 70-75% accuracy
- **After Fine-Tuning**: 80-85% accuracy (close to GPT-4o)

---

## 📋 **WEEKLY CHECKLIST**

### **Week 1-2: Collection Phase**
- [ ] Collect 200-300 pages using GPT-4o
- [ ] Use batch processing for efficiency
- [ ] Export dataset weekly (backup)
- [ ] Monitor pattern distribution
- [ ] Check Urdu/Roman Urdu detection

### **Week 3: Quality Assurance**
- [ ] Review 20 random entries manually
- [ ] Check pattern distribution balance
- [ ] Validate Urdu/Roman Urdu coverage
- [ ] Export final dataset for analysis
- [ ] Document any issues found

### **Week 4: Preparation**
- [ ] Export complete dataset bundle
- [ ] Analyze dataset statistics
- [ ] Split into train/val/test sets
- [ ] Set up UI-TARS environment
- [ ] Convert dataset to UI-TARS format

### **Week 5: Fine-Tuning**
- [ ] Fine-tune UI-TARS on your dataset
- [ ] Validate on test set
- [ ] Compare with GPT-4o baseline
- [ ] Iterate if needed

---

## 🎯 **KEY METRICS TO TRACK**

### **During Collection:**
1. **Total Pages**: Target 200-500
2. **Patterns per Page**: Average 1-5
3. **Prevalence Rate**: 60-80% (pages with patterns)
4. **Urdu Coverage**: 30-40% of patterns have Urdu/Roman Urdu
5. **Pattern Balance**: All 6 categories represented

### **After Collection:**
1. **Dataset Size**: 200-500 pages
2. **Total Patterns**: 500-2000 patterns
3. **Pattern Distribution**: Balanced across 6 categories
4. **Quality Score**: 85%+ accuracy (validated manually)

---

## 💡 **PRO TIPS**

### **Collection Tips:**
1. ✅ **Start with major sites** (Daraz, OLX) - they have more patterns
2. ✅ **Use auto-crawl** on homepage - discovers many pages automatically
3. ✅ **Focus on checkout/cart** - highest pattern density
4. ✅ **Export weekly** - don't lose progress
5. ✅ **Review samples** - catch quality issues early

### **Quality Tips:**
1. ✅ **Delete low-quality entries** - better to have fewer high-quality
2. ✅ **Balance categories** - don't over-collect one type
3. ✅ **Validate Urdu detection** - critical for your research
4. ✅ **Check confidence scores** - filter <0.7 if needed

### **Fine-Tuning Tips:**
1. ✅ **More data = better** - aim for 300-500 pages minimum
2. ✅ **Balanced dataset** - equal representation of categories
3. ✅ **High-quality labels** - GPT-4o labels are excellent
4. ✅ **Validate splits** - no data leakage between train/test

---

## 🚨 **COMMON ISSUES & SOLUTIONS**

### **Issue 1: Low Pattern Detection**
**Solution:**
- Check if pages actually have patterns
- Review prompt (current prompt is good)
- Try different pages (checkout has more patterns)

### **Issue 2: Unbalanced Categories**
**Solution:**
- Manually collect pages for missing categories
- Use specific URLs known to have those patterns
- Adjust collection strategy

### **Issue 3: Low Urdu Detection**
**Solution:**
- Focus on Urdu-heavy sites
- Check if Urdu text is visible in screenshots
- Current prompt includes Urdu examples (should work)

### **Issue 4: API Rate Limits**
**Solution:**
- Space out batch processing
- Process in smaller batches (10-20 URLs at a time)
- Use retry logic (already implemented)

---

## 📞 **NEXT STEPS SUMMARY**

### **This Week:**
1. ✅ Continue collecting with GPT-4o (target: 200-300 pages)
2. ✅ Use batch processing features
3. ✅ Export dataset weekly
4. ✅ Monitor quality metrics

### **Next Week:**
1. ✅ Review data quality
2. ✅ Balance dataset if needed
3. ✅ Export final dataset
4. ✅ Prepare for fine-tuning

### **Week 4-5:**
1. ✅ Set up UI-TARS
2. ✅ Convert dataset format
3. ✅ Fine-tune model
4. ✅ Validate results

---

## 🎓 **RESOURCES**

### **UI-TARS Documentation:**
- GitHub: https://github.com/bytedance/ui-tars
- Fine-tuning guide: (check UI-TARS docs)

### **Your Current System:**
- Dataset Collection: `apps/chrome-extension/src/extension/dataset-collection/`
- Export Functions: `apps/chrome-extension/src/utils/datasetDB.ts`
- AI Model Integration: `packages/core/src/ai-model/`

---

**You're on the right track! Keep collecting high-quality data with GPT-4o, then fine-tune UI-TARS for cost-effective scaling. Good luck with your FYP! 🚀**



