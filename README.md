# Experimental AI Ad Blocker

[![Chrome Web Store Version](https://img.shields.io/chrome-web-store/v/icmfnmnifkggchbpaikgbpoenjgkkofb?style=flat-square&logo=googlechrome&logoColor=white&label=version)](https://chromewebstore.google.com/detail/ai-adblocker/icmfnmnifkggchbpaikgbpoenjgkkofb)

Extension for blocking unwanted content using AI-powered rules with both LLM embeddings and direct prompt-based analysis.

## 🌐 Get the Extension

**[Install from Chrome Web Store](https://chromewebstore.google.com/detail/ai-adblocker/icmfnmnifkggchbpaikgbpoenjgkkofb)**

Alternatively, you can build and install it manually from source (see [Build](#build) and [Installation](#installation) sections below).

## ⚠️ Disclaimer

**This extension is experimental.** Use it at your own risk and be careful when using it on production websites.

**Note:** This codebase was developed with LLM assistance under my control, but the code has changed significantly during experiments and I might have missed redundant or unnecessary parts.

If you encounter problems or have questions:
- Create an issue in this repository
- Contact me at **maximtop@gmail.com**

## Presentation Materials

- 🎬 [View presentation with animations](https://docs.google.com/presentation/d/1Py_jGJie2UNPHMv27SCKY4MYN4n-lc8FL74aAg5IXpc/edit?usp=sharing) (Google Slides)
- 📄 [Download PDF version](./presentation.pdf) (static, no animations)

## Table of Contents

- [Build](#build)
- [Installation](#installation)
- [Usage](#usage)
- [How It Works](#how-it-works)
- [Debug and Configuration](#debug-and-configuration)
- [Testing](TESTING.md)
- [Requirements](#requirements)
- [Chrome Built-in AI](#chrome-built-in-ai-optional)
- [Models Used](#models-used)

## Build

**Commands:**
- `make init` - Install dependencies
- `make build` - Build the extension (output to `dist/`, includes `extension.zip`)
- `make lint` - Lint and type-check the code
- `pnpm test` - Run unit tests

## Installation

**Prerequisites:** Build the extension first (see Build section above)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked extension"
4. Select the `dist/` folder from this project

**Important:** By default, the extension is configured to work **only with local test pages** (`file:///*/index.html`, `file:///*/visual-test.html`, `file:///*/debug.html`). To use it on other websites, update the `matches` array in `manifest.json` (lines 25-29) before building. For example:
```json
"matches": ["<all_urls>"]
```
or specify specific domains:
```json
"matches": ["https://*.example.com/*", "https://anothersite.com/*"]
```

## Usage

1. **Rule Configuration**:
   - Add rules using three formats:
     - `selector:contains-meaning-embedding('text')` - semantic similarity
     - `selector:contains-meaning-prompt('criteria')` - direct AI analysis
     - `selector:contains-meaning-vision('criteria')` - visual AI analysis
   - Use the "×" button to remove rules
   - Use the "✏️" button to edit existing rules
   - Use the "Test" button to preview rule matches

2. **Automatic Analysis**:
   - Rules are applied automatically when pages load
   - Blocked elements are visually blurred

## How It Works

The extension supports three AI-powered detection methods:

### Embedding-Based Rules (`:contains-meaning-embedding`)
1. **Element Discovery**: Scans page elements using CSS selectors
2. **Text Embeddings**: Converts element text and rule text to vector representations
3. **Similarity Comparison**: Calculates cosine similarity between vectors
4. **Smart Classification**: Elements with sufficient similarity are blocked

**Syntax:**
```css
selector:contains-meaning-embedding('text')
```

**Examples:**
- `div[class*="ad"]:contains-meaning-embedding('advertisement')`
- `aside:contains-meaning-embedding('buy')`
- `*[id*="promo"]:contains-meaning-embedding('promotional')`

### Prompt-Based Rules (`:contains-meaning-prompt`)
1. **Element Discovery**: Scans page elements using CSS selectors
2. **Direct AI Analysis**: Sends element content directly to AI for analysis
3. **Contextual Decision**: AI determines if content matches the specified criteria
4. **Smart Blocking**: More accurate but slower than embedding-based rules

**Syntax:**
```css
selector:contains-meaning-prompt('criteria')
```

**Examples:**
- `div:contains-meaning-prompt('promotional content trying to sell products')`
- `article:contains-meaning-prompt('clickbait or sensational headlines')`
- `section:contains-meaning-prompt('content asking for donations or subscriptions')`

### Vision-Based Rules (`:contains-meaning-vision`)
1. **Element Discovery**: Scans page elements using CSS selectors
2. **Screenshot Capture**: Automatically captures screenshots of visible elements
3. **Vision AI Analysis**: Sends images to vision-capable AI models
4. **Visual Understanding**: AI analyzes actual visual appearance, not just text content
5. **Smart Blocking**: Detects ads by their visual characteristics (images, layouts, designs)

**Syntax:**
```css
selector:contains-meaning-vision('criteria')
```

**Examples:**
- `div:contains-meaning-vision('advertisement banner or promotional image')`
- `img:contains-meaning-vision('product advertisement or sponsored content')`
- `section:contains-meaning-vision('visual promotional content')`

**Perfect for**: Image-based ads or visually deceptive content that can't be detected by text alone.

## Debug and Configuration

### Console Debugging
In the browser console (F12), you'll see detailed information for each analyzed element:

- Element text content and dimensions
- CSS classes and selector path
- Rule evaluation results:
  - **Embedding rules**: Similarity scores and matching results
  - **Prompt rules**: AI analysis results and explanations
- DOM element reference for inspection

### Settings Configuration
- Click the "⚙️ Settings" button in the popup
- Select LLM provider
- Select models for embeddings, prompts, and vision
- Clear all data if needed to start fresh

## Requirements

- Chrome browser (Manifest V3 compatible)
- **For local AI**: Chrome 138+ (Stable or Canary) with built-in AI enabled, **OR**
- **For local AI**: Local model server running with compatible models
- **For cloud AI**: OpenAI API key (optional, for cloud-based analysis)

## Chrome Built-in AI (Optional)

Chrome 141+ includes Gemini Nano, a local AI model that runs entirely on your device - **no API keys, no costs, completely private!**

**Requirements**: Chrome 141+, 22GB free disk space, 4GB+ VRAM or 16GB+ RAM

**Quick Setup**:
1. Enable flags at `chrome://flags/#prompt-api-for-gemini-nano` and `chrome://flags/#optimization-guide-on-device-model`
2. Restart Chrome
3. Select Gemini Nano models in extension settings
4. First use triggers automatic model download (~22GB, one-time)

Check status at `chrome://on-device-internals`

## Models Used

- **Chrome Built-in AI**: Local models for text and vision analysis (free)
- **Local Model Servers**: Support for embedding and chat models (free)
- **Cloud Providers**: OpenAI, OpenRouter for cloud-based analysis (paid)
