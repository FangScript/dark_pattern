# 🔨 How to Rebuild the Extension

## Quick Steps

### **Step 1: Navigate to Extension Directory**

```bash
cd apps/chrome-extension
```

### **Step 2: Build the Extension**

```bash
pnpm run build
```

This will:
- Build all TypeScript/React code
- Bundle everything into the `dist/` folder
- Package the extension

**Time**: Usually takes 1-2 minutes

### **Step 3: Reload Extension in Chrome**

1. Open Chrome and go to `chrome://extensions/`
2. Find your "Dark Pattern Hunter" or "Midscene" extension
3. Click the **🔄 Reload** button (or toggle it off and on)
4. OR click "Remove" and then "Load unpacked" again

### **Step 4: Test the New Features**

1. Go to `https://www.daraz.pk/` (or any category page)
2. Open the extension popup
3. Click **"Batch Process (Auto Crawl)"**
4. You should now see the new modal with "Deep Scan" option!

---

## Alternative: Build from Root

If you're in the project root:

```bash
# Build all packages first (if needed)
pnpm run build

# Then build extension specifically
cd apps/chrome-extension
pnpm run build
```

---

## Troubleshooting

### **If build fails:**

1. **Make sure dependencies are installed:**
   ```bash
   pnpm install
   ```

2. **Build core packages first:**
   ```bash
   # From project root
   pnpm run build
   ```

3. **Check for TypeScript errors:**
   ```bash
   cd apps/chrome-extension
   pnpm run build
   # Look for any error messages
   ```

### **If extension doesn't update:**

1. **Hard reload in Chrome:**
   - Go to `chrome://extensions/`
   - Click "Remove" on the extension
   - Click "Load unpacked"
   - Select `apps/chrome-extension/dist` folder

2. **Clear browser cache:**
   - Close all Chrome windows
   - Reopen and reload extension

---

## What Changed?

The enhanced auto-crawler now includes:
- ✅ Deep Scan mode (scrolls + waits for dynamic content)
- ✅ Quick Scan mode (fast, original behavior)
- ✅ Smart URL filtering
- ✅ URL categorization (Product/Category/Other)

After rebuilding, you'll see these new features when you click "Batch Process (Auto Crawl)"!



