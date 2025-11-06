# Extension Localization

This extension now supports **13 languages**, covering approximately **77-80% of internet users worldwide**.

## Supported Languages

### Original Languages (28.4% coverage)
- 🇬🇧 **English** (en) - 25.9% of internet users
- 🇷🇺 **Russian** (ru) - 2.5% of internet users

### Phase 1: High Priority Languages (added ~37%)
- 🇨🇳 **Chinese Simplified** (zh_CN) - 19.4% of internet users
- 🇪🇸 **Spanish** (es) - 7.9% of internet users
- 🇸🇦 **Arabic** (ar) - 5.2% of internet users
- 🇧🇷 **Portuguese (Brazil)** (pt_BR) - 3.7% of internet users
- 🇫🇷 **French** (fr) - 3.3% of internet users

### Phase 2: Medium Priority Languages (added ~7%)
- 🇮🇩 **Indonesian** (id) - 4.3% of internet users
- 🇯🇵 **Japanese** (ja) - 2.6% of internet users
- 🇩🇪 **German** (de) - 2.0% of internet users

### Phase 3: Extended Coverage (added ~4%)
- 🇰🇷 **Korean** (ko) - 1.4% of internet users
- 🇮🇹 **Italian** (it) - 1.3% of internet users
- 🇹🇷 **Turkish** (tr) - 1.3% of internet users

## Total Coverage
**~77-80% of global internet users** can now use this extension in their native language.

## Locale File Structure

Each language has its own directory under `src/_locales/[locale_code]/messages.json`:

```
src/_locales/
├── ar/          # Arabic
├── de/          # German
├── en/          # English (default)
├── es/          # Spanish
├── fr/          # French
├── id/          # Indonesian
├── it/          # Italian
├── ja/          # Japanese
├── ko/          # Korean
├── pt_BR/       # Portuguese (Brazil)
├── ru/          # Russian
├── tr/          # Turkish
└── zh_CN/       # Chinese (Simplified)
```

## How Browser Selects Language

Chrome/Edge automatically selects the most appropriate locale based on:
1. Browser's language setting
2. Operating system language
3. Falls back to English if no match is found

## Translation Keys

All locales include translations for:
- `extensionName` - The extension name
- `extensionDescription` - Extension description shown in Chrome Web Store
- `ruleBasedBlocking` - UI section title
- `ruleFormat` - Help text for rule format
- `blockingRules` - Rules list label
- `addRulePlaceholder` - Input placeholder
- `addButton` - Add button text
- `emptyRules` - Empty state message
- `enterRule` - Error message for empty input
- `invalidFormat` - Error message for invalid format
- `ruleExists` - Error message for duplicates
- `ruleAdded` - Success message (with placeholder)
- `ruleRemoved` - Success message (with placeholder)

## Future Expansion

To add more languages:
1. Create a new directory under `src/_locales/[locale_code]/`
2. Copy `en/messages.json` as a template
3. Translate all message values (keep keys in English)
4. Run `pnpm build` to include in the extension
5. No manifest.json changes needed - Chrome auto-detects available locales

## Testing Locales

To test a specific locale:
1. Open Chrome/Edge settings
2. Go to Languages
3. Add and move your target language to the top
4. Restart the browser
5. The extension will automatically use the selected language

