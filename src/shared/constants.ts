// Shared constants for the AI AdBlocker extension
// Only includes constants used across multiple script contexts
// (background, content, popup, options)

// Default thresholds for classification
export const DEFAULT_EMBEDDING_THRESHOLD = 0.32; // For embedding rules
// For prompt rules (LLM confidence)
export const DEFAULT_PROMPT_THRESHOLD = 0.7;
// For vision rules (vision model confidence)
export const DEFAULT_VISION_THRESHOLD = 0.7;

// Ground truth labels for element classification
export const GROUND_TRUTH = {
    AD: 'ad',
    NOT_AD: 'not-ad',
} as const;

export type GroundTruthLabel =
    typeof GROUND_TRUTH[keyof typeof GROUND_TRUTH];

// Maximum text length for OpenAI API (~6000 tokens = ~4500 characters)
export const MAX_TEXT_LENGTH = 4000;

// LLM Provider names
export const LLM_PROVIDERS = {
    CHROME_PROMPT: 'chromePrompt',
    LMSTUDIO: 'lmstudio',
    OPENAI: 'openai',
    OPENROUTER: 'openrouter',
    // Future providers can be added here
    // ANTHROPIC: 'anthropic',
} as const;

export type LLMProvider = typeof LLM_PROVIDERS[keyof typeof LLM_PROVIDERS];

// Default LLM provider (derived from default prompt/vision models)
export const DEFAULT_LLM_PROVIDER: LLMProvider = LLM_PROVIDERS.OPENAI;

/**
 * Generate a unique model ID from provider and model name
 * Used for storing in settings with provider context
 * @param modelName The model name
 * @param provider The provider
 * @returns Unique ID in "provider:modelName" format
 */
export function getModelId(modelName: string, provider: LLMProvider): string {
    return `${provider}:${modelName}`;
}

// Model names (to avoid duplication)
const QWEN3_EMBEDDING_MODEL = 'text-embedding-qwen3-embedding-0.6b';
const OPENAI_TEXT_EMBEDDING_3_LARGE = 'text-embedding-3-large';
const GOOGLE_GEMMA_3N_E4B = 'google/gemma-3n-e4b';
const GPT_5_NANO = 'gpt-5-nano';
const GPT_5_MINI = 'gpt-5-mini';
const CHROME_GEMINI_NANO = 'gemini-nano';
const CHROME_GEMINI_NANO_VISION = 'gemini-nano-vision';
const GOOGLE_GEMINI_2_5_FLASH = 'google/gemini-2.5-flash';
const GOOGLE_GEMINI_2_5_FLASH_LITE = 'google/gemini-2.5-flash-lite';
const ANTHROPIC_CLAUDE_3_HAIKU = 'anthropic/claude-3-haiku';

// Default AI model configurations
// LM Studio
export const DEFAULT_LMSTUDIO_EMBEDDING_MODEL = QWEN3_EMBEDDING_MODEL;
export const DEFAULT_LMSTUDIO_CHAT_MODEL = '';
// Defaults (using unique provider:model IDs via getModelId helper)
export const DEFAULT_EMBEDDING_MODEL = getModelId(
    QWEN3_EMBEDDING_MODEL,
    LLM_PROVIDERS.LMSTUDIO,
);
export const DEFAULT_PROMPT_MODEL = getModelId(
    GPT_5_NANO,
    LLM_PROVIDERS.OPENAI,
);
export const DEFAULT_VISION_MODEL = getModelId(
    GPT_5_MINI,
    LLM_PROVIDERS.OPENAI,
);

/**
 * Model option structure
 * Simple data-only structure - UI strings generated where needed
 */
export interface ModelOption {
    id: string; // Unique ID: "provider:modelName"
    name: string; // Model name to send to API
    provider: LLMProvider; // Provider enum
}

const addId = (
    {
        name,
        provider,
    }: {
        name: string;
        provider: LLMProvider
    },
) => ({
    id: getModelId(name, provider),
    name,
    provider,
});

const QWEN_3_EMBEDDING_LM_STUDIO = addId({
    name: QWEN3_EMBEDDING_MODEL,
    provider: LLM_PROVIDERS.LMSTUDIO,
});

const TEXT_EMBEDDING_3_LARGE_OPEN_AI = addId({
    name: OPENAI_TEXT_EMBEDDING_3_LARGE,
    provider: LLM_PROVIDERS.OPENAI,
});

const GOOGLE_GEMINI_NANO_CHROME_PROMPT = addId({
    name: CHROME_GEMINI_NANO,
    provider: LLM_PROVIDERS.CHROME_PROMPT,
});

const GOOGLE_GEMMA_3N_E4B_LM_STUDIO = addId({
    name: GOOGLE_GEMMA_3N_E4B,
    provider: LLM_PROVIDERS.LMSTUDIO,
});

const GPT_5_NANO_OPEN_AI = addId({
    name: GPT_5_NANO,
    provider: LLM_PROVIDERS.OPENAI,
});

const OPENAI_GPT_5_NANO_OPEN_ROUTER = addId({
    name: GPT_5_NANO,
    provider: LLM_PROVIDERS.OPENROUTER,
});

const GPT_5_MINI_OPEN_AI = addId({
    name: GPT_5_MINI,
    provider: LLM_PROVIDERS.OPENAI,
});

const OPENAI_GPT_5_MINI_OPEN_ROUTER = addId({
    name: GPT_5_MINI,
    provider: LLM_PROVIDERS.OPENROUTER,
});

const GOOGLE_GEMINI_2_5_FLASH_OPEN_ROUTER = addId({
    name: GOOGLE_GEMINI_2_5_FLASH,
    provider: LLM_PROVIDERS.OPENROUTER,
});

const GOOGLE_GEMINI_2_5_FLASH_LITE_OPEN_ROUTER = addId({
    name: GOOGLE_GEMINI_2_5_FLASH_LITE,
    provider: LLM_PROVIDERS.OPENROUTER,
});

const ANTHROPIC_CLAUDE_3_HAIKU_OPEN_ROUTER = addId({
    name: ANTHROPIC_CLAUDE_3_HAIKU,
    provider: LLM_PROVIDERS.OPENROUTER,
});

const GOOGLE_GEMINI_NANO_VISION_CHROME_PROMPT = addId({
    name: CHROME_GEMINI_NANO_VISION,
    provider: LLM_PROVIDERS.CHROME_PROMPT,
});

export const ALL_MODELS = [
    QWEN_3_EMBEDDING_LM_STUDIO,
    TEXT_EMBEDDING_3_LARGE_OPEN_AI,
    GOOGLE_GEMINI_NANO_CHROME_PROMPT,
    GOOGLE_GEMMA_3N_E4B_LM_STUDIO,
    GPT_5_NANO_OPEN_AI,
    GPT_5_MINI_OPEN_AI,
    OPENAI_GPT_5_MINI_OPEN_ROUTER,
    OPENAI_GPT_5_NANO_OPEN_ROUTER,
    GOOGLE_GEMINI_2_5_FLASH_OPEN_ROUTER,
    GOOGLE_GEMINI_2_5_FLASH_LITE_OPEN_ROUTER,
    GOOGLE_GEMINI_NANO_VISION_CHROME_PROMPT,
    ANTHROPIC_CLAUDE_3_HAIKU_OPEN_ROUTER,
];

/**
 * All models registry - map unique ID to model
 * Key is unique ID (provider:modelName), value is model info
 */
export const ALL_MODELS_MAP: Record<string, ModelOption> = ALL_MODELS.reduce(
    (acc, model) => {
        acc[model.id] = model;
        return acc;
    },
    {} as Record<string, ModelOption>,
);

/**
 * Available model IDs for each category (references to ALL_MODELS)
 */
export const EMBEDDING_MODELS: string[] = [
    QWEN_3_EMBEDDING_LM_STUDIO.id,
    TEXT_EMBEDDING_3_LARGE_OPEN_AI.id,
];

export const PROMPT_MODELS: string[] = [
    GOOGLE_GEMINI_NANO_CHROME_PROMPT.id,
    GOOGLE_GEMMA_3N_E4B_LM_STUDIO.id,
    GPT_5_NANO_OPEN_AI.id,
    OPENAI_GPT_5_NANO_OPEN_ROUTER.id,
    GOOGLE_GEMINI_2_5_FLASH_OPEN_ROUTER.id,
    GOOGLE_GEMINI_2_5_FLASH_LITE_OPEN_ROUTER.id,
    ANTHROPIC_CLAUDE_3_HAIKU_OPEN_ROUTER.id,
];

export const VISION_MODELS: string[] = [
    GOOGLE_GEMINI_NANO_VISION_CHROME_PROMPT.id,
    GPT_5_MINI_OPEN_AI.id,
    OPENAI_GPT_5_MINI_OPEN_ROUTER.id,
    GOOGLE_GEMINI_2_5_FLASH_OPEN_ROUTER.id,
    GOOGLE_GEMINI_2_5_FLASH_LITE_OPEN_ROUTER.id,
    ANTHROPIC_CLAUDE_3_HAIKU_OPEN_ROUTER.id,
];

// Rule type constants
export const RULE_TYPE = {
    EMBEDDING: 'embedding',
    PROMPT: 'prompt',
    VISION: 'vision',
} as const;

export type RuleType = typeof RULE_TYPE[keyof typeof RULE_TYPE];

// Rule format validation and parsing patterns
export const RULE_PATTERNS = {
    // Domain-rule separator in rule syntax: domain1,domain2#?#selector:contains-meaning-*('...')
    DOMAIN_SEPARATOR: '#?#',

    // Validation patterns (for format checking)
    VALIDATION: {
        EMBEDDING: /^.+:contains-meaning-embedding\(['"].+['"]?\)$/,
        PROMPT: /^.+:contains-meaning-prompt\(['"].+['"]?\)$/,
        VISION: /^.+:contains-meaning-vision\(['"].+['"]?\)$/,
    },

    // Parsing patterns (with capture groups for extraction)
    PARSING: {
        EMBEDDING: /^(.+?):contains-meaning-embedding\(['"](.+?)['"]?\)$/,
        PROMPT: /^(.+?):contains-meaning-prompt\(['"](.+?)['"]?\)$/,
        VISION: /^(.+?):contains-meaning-vision\(['"](.+?)['"]?\)$/,
    },
} as const;

// Storage keys for settings and data
export const STORAGE_KEYS = {
    // Unified settings object (new approach with validation)
    SETTINGS: 'settings',
    OPENAI_API_KEY: 'openaiApiKey',
    OPENROUTER_API_KEY: 'openrouterApiKey',
    EMBEDDING_MODEL: 'embeddingModel',
    PROMPT_MODEL: 'promptModel',
    VISION_MODEL: 'visionModel',
    // Rule management
    AD_BLOCK_RULES: 'adBlockRules',
    // Thresholds (per-provider)
    EMBEDDING_THRESHOLD: 'embeddingThreshold',
    PROMPT_THRESHOLD: 'promptThreshold',
    VISION_THRESHOLD: 'visionThreshold',
    // General settings
    BLOCKING_ENABLED: 'blockingEnabled',
    SAVE_SCREENSHOTS_TO_DOWNLOADS: 'saveScreenshotsToDownloads',
    // Cache keys (stores all LLM analysis: embeddings, prompts, vision)
    LLM_ANALYSIS_CACHE: 'llmAnalysisCache',
    LLM_CACHE_META: 'llmCacheMeta',
    // Performance benchmarking
    EMBEDDING_BENCHMARK_ENABLED: 'embeddingBenchmarkEnabled',
    EMBEDDING_BENCHMARK_DATA: 'embeddingBenchmarkData',
} as const;

// Settings property keys (matches Settings schema)
export const SETTINGS_KEYS = {
    OPENAI_API_KEY: 'openaiApiKey',
    OPENROUTER_API_KEY: 'openrouterApiKey',
    EMBEDDING_MODEL: 'embeddingModel',
    PROMPT_MODEL: 'promptModel',
    VISION_MODEL: 'visionModel',
    EMBEDDING_THRESHOLD: 'embeddingThreshold',
    PROMPT_THRESHOLD: 'promptThreshold',
    VISION_THRESHOLD: 'visionThreshold',
    BLOCKING_ENABLED: 'blockingEnabled',
    SAVE_SCREENSHOTS_TO_DOWNLOADS: 'saveScreenshotsToDownloads',
    DEBUG_LOGGING: 'debugLogging',
    AD_BLOCK_RULES: 'adBlockRules',
} as const;

// Port names for chrome.runtime port connections
export const PORT_NAMES = {
    OFFSCREEN_CROP: 'offscreen-crop',
    SCREENSHOT_CAPTURE: 'screenshot-capture',
    STREAMING_ANALYSIS: 'streaming-analysis',
} as const;

// TODO check actions actuality
// Message actions for chrome.runtime communication
export const ACTIONS = {
    ADD_RULE: 'addRule',
    ANALYSIS_COMPLETE: 'analysisComplete',
    ANALYZE_ELEMENTS: 'analyzeElements',
    CAPTURE_PAGE_SCREENSHOT: 'capturePageScreenshot',
    CLEAR_EMBEDDING_CACHE: 'clearEmbeddingCache',
    CROP_IMAGE: 'cropImage',
    DOWNLOAD_CANVAS_IMAGE: 'downloadCanvasImage',
    GET_ALL_RULES: 'getAllRules',
    GET_BLOCKING_STATUS: 'getBlockingStatus',
    GET_RULES: 'getRules',
    GET_SETTINGS: 'getSettings',
    GET_THRESHOLDS: 'getThresholds',
    REMOVE_RULE: 'removeRule',
    SCREENSHOT_CAPTURED: 'screenshotCaptured',
    SET_EMBEDDING_THRESHOLD: 'setEmbeddingThreshold',
    SET_PROMPT_THRESHOLD: 'setPromptThreshold',
    SET_VISION_THRESHOLD: 'setVisionThreshold',
    START_ANALYSIS: 'startAnalysis',
    TOGGLE_RULE: 'toggleRule',
    UNBLOCK_ALL: 'unblockAll',
    UPDATE_SETTINGS: 'updateSettings',
    VALIDATE_RULE: 'validateRule',
} as const;

// Screenshot configuration
export const SCREENSHOT_CONFIG = {
    FORMAT: 'png',
    QUALITY: 90,
    FILENAME_PREFIX: 'screenshot',
} as const;

// Default value for saving screenshots to downloads
export const DEFAULT_SAVE_SCREENSHOTS_TO_DOWNLOADS = false;

// Default value for debug logging (disabled to reduce console noise)
export const DEFAULT_DEBUG_LOGGING = false;

// Embedding benchmark configuration
export const EMBEDDING_BENCHMARK_CONFIG = {
    MAX_MEASUREMENTS_PER_MODEL: 50,
    DEFAULT_ENABLED: false,
} as const;

// Auto-screenshot observer configuration
export const AUTO_SCREENSHOT_CONFIG = {
    VISIBILITY_THRESHOLD: 1.0,
    // Capture margins to include more context (in pixels)
    MARGIN_TOP: 20,
    MARGIN_RIGHT: 10,
    MARGIN_BOTTOM: 20,
    MARGIN_LEFT: 10,
} as const;
