import {
    LLM_PROVIDERS,
    RULE_TYPE,
} from '../shared/constants';
import type { LLMProvider, RuleType } from '../shared/constants';
import { createLogger } from '../shared/logger';
import { SettingsManager } from '../shared/settings';
import type { Settings } from '../shared/settings-schema';
import {
    BaseLLMAdapter,
    ImageAnalysisOptions,
} from './adapters/base-llm-adapter';
import { ChromePromptAdapter } from './adapters/chrome-prompt-adapter';
import { LMStudioAdapter } from './adapters/lmstudio-adapter';
import { OpenAIAdapter } from './adapters/openai-adapter';
import { OpenRouterAdapter } from './adapters/openrouter-adapter';
import { CacheManager } from './cache-manager';
import { EmbeddingBenchmark, EmbeddingTextType } from './embedding-benchmark';
import { getModelInfo } from '../shared/model-utils';
import { VectorMath } from './vector-math';

const logger = createLogger('LLMService');

const CACHE_KEY_TYPES = {
    EMBEDDING: 'embedding',
    IMAGE: 'image',
    PROMPT: 'prompt',
} as const;

/**
 * Provider availability cache TTL in milliseconds
 */
const PROVIDER_AVAILABILITY_TTL = 30000; // 30 seconds

/**
 * Analysis result returned by service methods
 */
export interface AnalysisResult {
    matches: boolean;
    confidence: number;
    explanation: string;
    provider: string;
    cached: boolean;
}

/**
 * Cache information for image analysis
 */
export interface CacheInfo {
    innerText?: string;
    groundTruth?: 'ad' | 'not-ad';
}

/**
 * Union type for all values that can be cached by LLMService
 */
type CachedValue = number[] | AnalysisResult;

/**
 * Provider availability cache entry
 */
interface ProviderAvailabilityCache {
    available: boolean;
    checkedAt: number;
}

/**
 * LLM Service - Multi-provider LLM operations with unified caching
 * Uses provider pool pattern: providers are instantiated on-demand based on model selection
 */
export class LLMService {
    /**
     * Provider pool - providers are created on-demand and reused
     * Key: LLMProvider enum value
     * Value: Adapter instance for that provider
     */
    private providers: Map<LLMProvider, BaseLLMAdapter>;

    private embeddingModel!: string;

    private promptModel!: string;

    private visionModel!: string;

    public embeddingThreshold!: number;

    public promptThreshold!: number;

    public visionThreshold!: number;

    private cacheManager!: CacheManager<CachedValue>;

    public benchmark: EmbeddingBenchmark;

    private providerAvailability: Map<string, ProviderAvailabilityCache>;

    /**
     * Current settings cached for provider instantiation
     */
    private currentSettings!: Settings;

    constructor() {
        this.providers = new Map();
        // Model and threshold properties are set in init() from storage
        // Using definite assignment assertion (!) for properties that are
        // guaranteed to be set before use
        this.benchmark = new EmbeddingBenchmark();
        this.providerAvailability = new Map();
    }

    /**
     * Get or create a provider adapter
     * Implements lazy instantiation - providers are created only when needed
     * @param provider Provider to get or create
     * @returns Provider adapter instance
     * @throws {Error} When provider is unknown or unavailable
     */
    private getOrCreateProvider(provider: LLMProvider): BaseLLMAdapter {
        // Check if provider already exists in the pool
        const existing = this.providers.get(provider);
        if (existing) {
            return existing;
        }

        // Create new provider instance based on type
        const { openaiApiKey, openrouterApiKey } = this.currentSettings;
        let adapter: BaseLLMAdapter;

        switch (provider) {
            case LLM_PROVIDERS.CHROME_PROMPT: {
                adapter = new ChromePromptAdapter({
                    promptModel: this.promptModel,
                    visionModel: this.visionModel,
                });
                logger.info('Chrome Prompt adapter created');
                break;
            }
            case LLM_PROVIDERS.LMSTUDIO: {
                adapter = new LMStudioAdapter({
                    embeddingModel: this.embeddingModel,
                    promptModel: this.promptModel,
                });
                logger.info('LM Studio adapter created');
                break;
            }
            case LLM_PROVIDERS.OPENAI: {
                adapter = new OpenAIAdapter({
                    apiKey: openaiApiKey || '',
                    embeddingModel: this.embeddingModel,
                    promptModel: this.promptModel,
                    visionModel: this.visionModel,
                });
                logger.info('OpenAI adapter created');
                break;
            }
            case LLM_PROVIDERS.OPENROUTER: {
                adapter = new OpenRouterAdapter({
                    apiKey: openrouterApiKey || '',
                    promptModel: this.promptModel,
                    visionModel: this.visionModel,
                });
                logger.info('OpenRouter adapter created');
                break;
            }
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }

        // Add to pool and return
        this.providers.set(provider, adapter);
        return adapter;
    }

    /**
     * Initialize service from storage
     * Providers are created on-demand when needed
     */
    async init(): Promise<void> {
        try {
            const settings = await SettingsManager.load();

            // Store settings for provider creation
            this.currentSettings = settings;

            // Assign loaded settings to instance properties
            this.embeddingModel = settings.embeddingModel;
            this.promptModel = settings.promptModel;
            this.visionModel = settings.visionModel;
            this.embeddingThreshold = settings.embeddingThreshold;
            this.promptThreshold = settings.promptThreshold;
            this.visionThreshold = settings.visionThreshold;

            const modelsMsg = `Models: embedding=${this.embeddingModel}, `
                + `prompt=${this.promptModel}, vision=${this.visionModel}`;
            logger.info(modelsMsg);

            const { provider: embProv } = getModelInfo(this.embeddingModel);
            const { provider: prmProv } = getModelInfo(this.promptModel);
            const { provider: visProv } = getModelInfo(this.visionModel);
            const providersMsg = 'Providers (lazy): '
                + `embedding=${embProv}, `
                + `prompt=${prmProv}, `
                + `vision=${visProv}`;
            logger.info(providersMsg);

            const thresholdsMsg = 'Thresholds: '
                + `embedding=${this.embeddingThreshold}, `
                + `prompt=${this.promptThreshold}, `
                + `vision=${this.visionThreshold}`;
            logger.info(thresholdsMsg);

            // Initialize cache manager
            // Cache keys include model identifiers for proper cache isolation
            this.cacheManager = new CacheManager();

            // Load cached data
            await this.cacheManager.load();

            // Initialize benchmark service
            await this.benchmark.init();
        } catch (error) {
            logger.error('Failed to initialize:', error);
        }
    }

    /**
     * Check if LM Studio server is running and accessible
     * @returns True if server is available
     */
    private async checkLMStudioHealth(): Promise<boolean> {
        try {
            const response = await fetch('http://localhost:1234/v1/models', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if provider is available with caching
     * @param provider LLM provider to check
     * @param openaiApiKey OpenAI API key (if applicable)
     * @param openrouterApiKey OpenRouter API key (if applicable)
     * @returns True if provider is available
     */
    private async isProviderAvailable(
        provider: LLMProvider,
        openaiApiKey?: string,
        openrouterApiKey?: string,
    ): Promise<boolean> {
        const cacheKey = `${provider}:availability`;
        const cached = this.providerAvailability.get(cacheKey);

        // Use cache if fresh (< 30s old)
        if (
            cached
            && Date.now() - cached.checkedAt < PROVIDER_AVAILABILITY_TTL
        ) {
            return cached.available;
        }

        // Check availability
        let available = false;
        if (provider === LLM_PROVIDERS.CHROME_PROMPT) {
            // Chrome Prompt API is built-in, always available in Chrome 138+
            available = true;
        } else if (provider === LLM_PROVIDERS.OPENAI) {
            // OpenAI requires API key
            available = !!openaiApiKey && openaiApiKey.length > 0;
        } else if (provider === LLM_PROVIDERS.OPENROUTER) {
            // OpenRouter requires API key
            available = !!openrouterApiKey && openrouterApiKey.length > 0;
        } else if (provider === LLM_PROVIDERS.LMSTUDIO) {
            // LM Studio requires server to be running
            available = await this.checkLMStudioHealth();
        }

        // Cache result
        this.providerAvailability.set(cacheKey, {
            available,
            checkedAt: Date.now(),
        });

        return available;
    }

    /**
     * Ensure settings are up-to-date for embedding operations
     * Updates current settings and clears provider pool if needed
     * @throws {Error} When provider is unavailable
     */
    private async ensureEmbeddingAdapter(): Promise<void> {
        const settings = await SettingsManager.load();
        const currentModel = settings.embeddingModel;
        const currentThreshold = settings.embeddingThreshold;

        // Parse provider and model (supports both "provider:model" and legacy "model" formats)
        const { provider: currentProvider } = getModelInfo(currentModel);
        const { provider: previousProvider } = getModelInfo(
            this.embeddingModel || currentModel,
        );

        // Check if settings changed
        const providerChanged = currentProvider !== previousProvider;
        const modelChanged = currentModel !== this.embeddingModel;
        const settingsChanged = JSON.stringify(this.currentSettings)
            !== JSON.stringify(settings);

        if (providerChanged || modelChanged || settingsChanged) {
            // Update cached settings
            this.currentSettings = settings;
            this.embeddingModel = currentModel;
            this.embeddingThreshold = currentThreshold;

            // Clear provider pool if provider changed - forces recreation
            if (providerChanged) {
                this.providers.delete(previousProvider);
                logger.info(`Cleared ${previousProvider} from provider pool`);
            }
        }

        // Check provider availability
        const available = await this.isProviderAvailable(
            currentProvider,
            settings.openaiApiKey,
            settings.openrouterApiKey,
        );

        if (!available) {
            if (currentProvider === LLM_PROVIDERS.OPENAI) {
                const msg = 'OpenAI API key required for embedding analysis';
                throw new Error(msg);
            }
            if (currentProvider === LLM_PROVIDERS.OPENROUTER) {
                const msg = 'OpenRouter API key required '
                    + 'for embedding analysis';
                throw new Error(msg);
            }
            if (currentProvider === LLM_PROVIDERS.LMSTUDIO) {
                const msg = 'LM Studio server not available '
                    + 'at http://localhost:1234';
                throw new Error(msg);
            }
        }
    }

    /**
     * Ensure settings are up-to-date for prompt operations
     * Updates current settings and clears provider pool if needed
     * @throws {Error} When provider is unavailable
     */
    private async ensurePromptAdapter(): Promise<void> {
        const settings = await SettingsManager.load();
        const currentPromptModel = settings.promptModel;
        const currentPromptThreshold = settings.promptThreshold;

        // Get provider and model info from registry
        const { provider: currentProvider } = getModelInfo(currentPromptModel);
        const { provider: previousProvider } = getModelInfo(
            this.promptModel || currentPromptModel,
        );

        // Check if settings changed
        const providerChanged = currentProvider !== previousProvider;
        const modelChanged = currentPromptModel !== this.promptModel;
        const settingsChanged = JSON.stringify(this.currentSettings)
            !== JSON.stringify(settings);

        if (providerChanged || modelChanged || settingsChanged) {
            // Update cached settings
            this.currentSettings = settings;
            this.promptModel = currentPromptModel;
            this.promptThreshold = currentPromptThreshold;

            // Clear provider pool if provider changed - forces recreation
            if (providerChanged) {
                this.providers.delete(previousProvider);
                logger.info(`Cleared ${previousProvider} from provider pool`);
            }
        }

        // Check provider availability
        const available = await this.isProviderAvailable(
            currentProvider,
            settings.openaiApiKey,
            settings.openrouterApiKey,
        );

        if (!available) {
            if (currentProvider === LLM_PROVIDERS.OPENAI) {
                throw new Error('OpenAI API key required for prompt analysis');
            }
            if (currentProvider === LLM_PROVIDERS.OPENROUTER) {
                const msg = 'OpenRouter API key required for prompt analysis';
                throw new Error(msg);
            }
            if (currentProvider === LLM_PROVIDERS.LMSTUDIO) {
                const msg = 'LM Studio server not available '
                    + 'at http://localhost:1234';
                throw new Error(msg);
            }
        }
    }

    /**
     * Ensure settings are up-to-date for vision operations
     * Updates current settings and clears provider pool if needed
     * @throws {Error} When provider is unavailable
     */
    private async ensureVisionAdapter(): Promise<void> {
        const settings = await SettingsManager.load();
        const currentVisionModel = settings.visionModel;
        const currentVisionThreshold = settings.visionThreshold;

        // Get provider and model info from registry
        const { provider: currentProvider } = getModelInfo(currentVisionModel);
        const { provider: previousProvider } = getModelInfo(
            this.visionModel || currentVisionModel,
        );

        // Check if settings changed
        const providerChanged = currentProvider !== previousProvider;
        const modelChanged = currentVisionModel !== this.visionModel;
        const settingsChanged = JSON.stringify(this.currentSettings)
            !== JSON.stringify(settings);

        if (providerChanged || modelChanged || settingsChanged) {
            // Update cached settings
            this.currentSettings = settings;
            this.visionModel = currentVisionModel;
            this.visionThreshold = currentVisionThreshold;

            // Clear provider pool if provider changed - forces recreation
            if (providerChanged) {
                this.providers.delete(previousProvider);
                logger.info(`Cleared ${previousProvider} from provider pool`);
            }
        }

        // Check provider availability
        const available = await this.isProviderAvailable(
            currentProvider,
            settings.openaiApiKey,
            settings.openrouterApiKey,
        );

        if (!available) {
            if (currentProvider === LLM_PROVIDERS.OPENAI) {
                throw new Error('OpenAI API key required for vision analysis');
            }
            if (currentProvider === LLM_PROVIDERS.OPENROUTER) {
                const msg = 'OpenRouter API key required for vision analysis';
                throw new Error(msg);
            }
            if (currentProvider === LLM_PROVIDERS.LMSTUDIO) {
                const msg = 'LM Studio server not available '
                    + 'at http://localhost:1234';
                throw new Error(msg);
            }
        }
    }

    /**
     * Get embedding vector for a text string
     * @param text Text to get embedding for
     * @param textType Type of text being embedded (content or query)
     * @returns The embedding vector
     * @throws {Error} When API call fails or response is invalid
     */
    async getEmbedding(
        text: string,
        textType?: EmbeddingTextType,
    ): Promise<number[]> {
        await this.ensureEmbeddingAdapter();

        // Get provider from model registry
        const { provider } = getModelInfo(this.embeddingModel);
        const adapter = this.getOrCreateProvider(provider);

        const cacheKey = `${CACHE_KEY_TYPES.EMBEDDING}:`
            + `${this.embeddingModel}:${text}`;
        const benchmarkEnabled = this.benchmark.isEnabled();

        // Skip cache when benchmarking to get accurate measurements
        if (!benchmarkEnabled) {
            // Check cache first
            const cachedEmbedding = this.cacheManager.get(cacheKey);
            if (cachedEmbedding && Array.isArray(cachedEmbedding)) {
                logger.debug(`Cache hit for: "${text.substring(0, 50)}..."`);
                return cachedEmbedding;
            }
        } else {
            logger.debug('📊 Benchmark mode: skipping cache');
        }

        try {
            logger.debug(`Fetching embedding: "${text.substring(0, 50)}..."`);

            // Measure performance if benchmarking is enabled
            const startTime = benchmarkEnabled ? performance.now() : 0;

            // Get model info from registry
            const model = getModelInfo(this.embeddingModel);

            const embedding = await adapter.getEmbedding(text, model.name);

            // Record benchmark measurement
            if (benchmarkEnabled) {
                const duration = performance.now() - startTime;
                await this.benchmark.recordMeasurement(
                    this.embeddingModel,
                    duration,
                    text.length,
                    textType,
                );
            }

            // Cache the embedding (unless benchmarking)
            if (!benchmarkEnabled) {
                this.cacheManager.set(cacheKey, embedding);
            }

            return embedding;
        } catch (error) {
            logger.error('Failed to get embedding:', error);
            throw error;
        }
    }

    /**
     * Analyze text using embedding similarity with caching
     * @param text Text to analyze
     * @param criteria Criteria to check against
     * @param groundTruth Ground truth label for accuracy tracking
     * @returns Analysis result with confidence based on cosine similarity
     * @throws {Error} When API call fails or response is invalid
     */
    async analyzeByEmbedding(
        text: string,
        criteria: string,
        groundTruth?: 'ad' | 'not-ad',
    ): Promise<AnalysisResult> {
        await this.ensureEmbeddingAdapter();

        const cacheKey = `${CACHE_KEY_TYPES.EMBEDDING}:`
            + `${this.embeddingModel}:similarity:${text}:${criteria}`;
        const benchmarkEnabled = this.benchmark.isEnabled();

        // Skip cache when benchmarking to get accurate measurements
        if (!benchmarkEnabled) {
            // Check cache first
            const cached = this.cacheManager.get(cacheKey);
            if (cached && typeof cached === 'object') {
                logger.debug('Cache hit for embedding similarity check');
                const result = cached as AnalysisResult;

                // Backfill explanation if missing from legacy cache
                if (!result.explanation && result.confidence !== undefined) {
                    const confPct = (result.confidence * 100).toFixed(1);
                    const thrPct = (this.embeddingThreshold * 100).toFixed(1);
                    // Note: using current threshold for display
                    result.explanation = `Cosine similarity ${confPct}%`
                        + ` (threshold: ${thrPct}%)`;
                }
                return result;
            }
        } else {
            logger.debug('📊 Benchmark mode: skipping cache');
        }

        try {
            // Start timing for benchmark
            const startTime = benchmarkEnabled ? performance.now() : 0;

            // Get embeddings for both text and criteria
            const [textEmbedding, criteriaEmbedding] = await Promise.all([
                this.getEmbedding(text, 'content'),
                this.getEmbedding(criteria, 'query'),
            ]);

            // Compute cosine similarity
            const confidence = VectorMath.cosineSimilarity(
                textEmbedding,
                criteriaEmbedding,
            );

            const matches = confidence >= this.embeddingThreshold;
            const confPct = (confidence * 100).toFixed(1);
            const thrPct = (this.embeddingThreshold * 100).toFixed(1);
            const explanation = `Cosine similarity ${confPct}%`
                + ` (threshold: ${thrPct}%)`;

            // Record benchmark measurement for embedding analysis
            if (benchmarkEnabled) {
                const duration = performance.now() - startTime;
                const combinedText = `${criteria}\n${text}`;
                await this.benchmark.recordMeasurement(
                    this.embeddingModel,
                    duration,
                    combinedText.length,
                    'content',
                    undefined,
                    undefined,
                    undefined,
                    groundTruth,
                    matches,
                    false,
                    explanation,
                );
            }

            const { provider: embeddingProvider } = getModelInfo(
                this.embeddingModel,
            );

            const result: AnalysisResult = {
                matches,
                confidence,
                explanation,
                provider: embeddingProvider,
                cached: false,
            };

            // Cache the result (unless benchmarking)
            if (!benchmarkEnabled) {
                this.cacheManager.set(cacheKey, result);
            }

            return result;
        } catch (error) {
            logger.error('Failed to analyze by embedding:', error);
            throw error;
        }
    }

    /**
     * Analyze text using LLM prompt with caching
     * @param text Text to analyze
     * @param criteria Criteria to check against
     * @param groundTruth Ground truth label for benchmarking (optional)
     * @returns Analysis result
     * @throws {Error} When API call fails or response is invalid
     */
    async analyzeByPrompt(
        text: string,
        criteria: string,
        groundTruth?: 'ad' | 'not-ad',
    ): Promise<AnalysisResult> {
        await this.ensurePromptAdapter();

        // Get provider from model registry
        const { provider } = getModelInfo(this.promptModel);
        const adapter = this.getOrCreateProvider(provider);

        const cacheKey = `${CACHE_KEY_TYPES.PROMPT}:`
            + `${this.promptModel}:${text}:${criteria}`;
        const benchmarkEnabled = this.benchmark.isEnabled();

        // Skip cache when benchmarking to get accurate measurements
        if (!benchmarkEnabled) {
            // Check cache first
            const cachedResult = this.cacheManager.get(cacheKey);
            if (cachedResult && !Array.isArray(cachedResult)) {
                // Silently return cached result - logging handled by BackgroundManager
                return { ...cachedResult, cached: true };
            }
        } else {
            logger.debug('📊 Benchmark mode: skipping cache');
        }

        try {
            const debugMsg = 'Analyzing text with prompt: '
                + `"${text.substring(0, 50)}..."`;
            logger.debug(debugMsg);

            // Start timing for benchmark
            const startTime = performance.now();

            // Get model info from registry
            const model = getModelInfo(this.promptModel);

            const result = await adapter.analyzeWithPrompt(
                text,
                criteria,
                model.name,
            );

            // Combine API's matches decision with confidence threshold
            // Both must be true: API says it matches AND confidence is high enough
            const threshold = this.promptThreshold;
            const matches = result.matches && result.confidence >= threshold;

            // Record benchmark measurement
            if (benchmarkEnabled) {
                const duration = performance.now() - startTime;
                const combinedText = `${criteria}\n${text}`;
                await this.benchmark.recordMeasurement(
                    this.promptModel,
                    duration,
                    combinedText.length,
                    'content',
                    undefined,
                    undefined,
                    result.usage,
                    groundTruth,
                    matches,
                    result.hadJsonError || false,
                );
            }

            const response: AnalysisResult = {
                matches,
                confidence: result.confidence,
                explanation: result.explanation,
                provider,
                cached: false,
            };

            // Cache the result (unless benchmarking)
            if (!benchmarkEnabled) {
                this.cacheManager.set(cacheKey, response);
            }

            // All result logging is now handled by BackgroundManager
            // in a collapsed group format for cleaner console output

            return response;
        } catch (error) {
            logger.error('Prompt analysis error:', error);
            throw error;
        }
    }

    /**
     * Analyze image using vision model (never cached)
     * @param imageData Base64-encoded image data
     * @param criteria Criteria to check against
     * @param cacheInfo Cache information with innerText
     * @param options Additional options
     * @returns Analysis result
     * @throws {Error} When API call fails or response is invalid
     */
    async analyzeByImage(
        imageData: string,
        criteria: string,
        cacheInfo: CacheInfo = {},
        options: ImageAnalysisOptions = {},
    ): Promise<AnalysisResult> {
        await this.ensureVisionAdapter();

        // Get provider from model registry
        const { provider } = getModelInfo(this.visionModel);
        const adapter = this.getOrCreateProvider(provider);

        // Extract text for logging purposes
        const innerText = cacheInfo.innerText || '';
        // Log only first 50 chars for readability
        const cacheId = innerText.substring(0, 50)
            + (innerText.length > 50 ? '...' : '');

        // Check if benchmarking is enabled (for recording measurements)
        const benchmarkEnabled = this.benchmark.isEnabled();

        // IMPORTANT: Vision analysis is NEVER cached because:
        // 1. Same text can have different images (ads rotate, images change)
        // 2. Screenshots capture current visual state which is dynamic
        // 3. We need to analyze what's ACTUALLY visible, not cached results
        // 4. Vision is specifically for real-time visual content analysis
        //
        // Cache key would be based on text alone, which is insufficient for
        // image analysis. To cache properly, we'd need to hash the image data
        // itself, but that defeats the purpose since we're analyzing visual
        // content that changes.
        logger.info(
            `📦 Vision analysis for "${cacheId}" - `
            + 'Cache bypassed (images are dynamic), calling vision API',
        );

        try {
            const imgSizeKb = (imageData.length / 1024).toFixed(2);
            const apiCallMsg = '🧠 Starting vision API call for '
                + `element text: "${cacheId}"\n`
                + `   - Criteria: "${criteria}"\n`
                + `   - Image size: ${imgSizeKb} KB\n`
                + `   - Model: ${this.visionModel}`;
            logger.info(apiCallMsg);

            // Start timing for benchmark
            const startTime = performance.now();

            // Get model info from registry
            const model = getModelInfo(this.visionModel);

            const result = await adapter.analyzeImage(
                imageData,
                criteria,
                model.name,
                options,
            );

            // Record benchmark measurement for vision analysis
            if (benchmarkEnabled) {
                const duration = performance.now() - startTime;
                const combinedText = `${criteria}\n${innerText}`;
                const detail = options.detail as 'auto' | 'low' | 'high' | undefined;

                // Extract ground truth if available
                const groundTruth = cacheInfo.groundTruth as 'ad' | 'not-ad' | undefined;

                await this.benchmark.recordMeasurement(
                    this.visionModel,
                    duration,
                    combinedText.length,
                    'content',
                    imageData.length,
                    detail || 'auto',
                    result.usage,
                    groundTruth,
                    result.matches,
                    result.hadJsonError || false,
                );
            }

            // Combine API's matches decision with confidence threshold
            // Both must be true: API says it matches
            // AND confidence is high enough
            const threshold = this.visionThreshold;
            const matches = result.matches && result.confidence >= threshold;

            // Vision results are NOT cached
            // (full details shown in MessageHandler console group)
            return {
                matches,
                confidence: result.confidence,
                explanation: result.explanation,
                provider,
                cached: false,
            };
        } catch (error) {
            logger.error('Image analysis error:', error);
            throw error;
        }
    }

    /**
     * Check if a specific provider requires an API key
     * @param provider Provider to check
     * @returns True if provider requires API key
     */
    private static providerRequiresApiKey(provider: LLMProvider): boolean {
        // Chrome Prompt API and LM Studio don't require API keys
        return provider === LLM_PROVIDERS.OPENAI
            || provider === LLM_PROVIDERS.OPENROUTER;
    }

    /**
     * Check if a specific rule type can be executed without API key
     * @param ruleType Type of rule (embedding, prompt, vision)
     * @returns True if rule can be executed, false if it requires
     * API key that's missing
     */
    canExecuteRuleType(ruleType: RuleType): boolean {
        let provider: LLMProvider;

        // Determine which provider to check based on rule type
        if (ruleType === RULE_TYPE.EMBEDDING) {
            provider = getModelInfo(this.embeddingModel).provider;
        } else if (ruleType === RULE_TYPE.VISION) {
            provider = getModelInfo(this.visionModel).provider;
        } else {
            provider = getModelInfo(this.promptModel).provider;
        }

        // If provider doesn't require API key (e.g., LM Studio, Chrome Prompt),
        // rule can be executed
        if (!LLMService.providerRequiresApiKey(provider)) {
            return true;
        }

        // Provider requires API key - check if we have it in settings
        if (provider === LLM_PROVIDERS.OPENAI) {
            return !!this.currentSettings?.openaiApiKey;
        }
        if (provider === LLM_PROVIDERS.OPENROUTER) {
            return !!this.currentSettings?.openrouterApiKey;
        }

        return false;
    }

    /**
     * Check if any model settings have changed
     * @param {Settings} newSettings New settings to compare against
     * @returns {boolean} True if any model has changed
     */
    private hasModelSettingsChanged(newSettings: Settings): boolean {
        return (
            this.embeddingModel !== newSettings.embeddingModel
            || this.promptModel !== newSettings.promptModel
            || this.visionModel !== newSettings.visionModel
        );
    }

    /**
     * Reload settings and update cache context
     * Should be called after settings are updated
     * Clears provider pool if providers changed
     */
    async reloadSettings(): Promise<void> {
        const settings = await SettingsManager.load();

        // Check if any models changed to determine if providers need clearing
        const modelsChanged = this.hasModelSettingsChanged(settings);

        // Get old providers for each model type
        const { provider: oldEmbeddingProvider } = getModelInfo(
            this.embeddingModel || settings.embeddingModel,
        );
        const { provider: oldPromptProvider } = getModelInfo(
            this.promptModel || settings.promptModel,
        );
        const { provider: oldVisionProvider } = getModelInfo(
            this.visionModel || settings.visionModel,
        );

        // Update model and threshold properties
        this.embeddingModel = settings.embeddingModel;
        this.promptModel = settings.promptModel;
        this.visionModel = settings.visionModel;
        this.embeddingThreshold = settings.embeddingThreshold;
        this.promptThreshold = settings.promptThreshold;
        this.visionThreshold = settings.visionThreshold;

        // Update cached settings
        this.currentSettings = settings;

        // Clear provider pool if providers changed
        if (modelsChanged) {
            const { provider: newEmbeddingProvider } = getModelInfo(
                this.embeddingModel,
            );
            const { provider: newPromptProvider } = getModelInfo(
                this.promptModel,
            );
            const { provider: newVisionProvider } = getModelInfo(
                this.visionModel,
            );

            // Clear old providers that are no longer needed
            if (oldEmbeddingProvider !== newEmbeddingProvider) {
                this.providers.delete(oldEmbeddingProvider);
                logger.info(`Cleared ${oldEmbeddingProvider} from provider pool`);
            }
            if (oldPromptProvider !== newPromptProvider) {
                this.providers.delete(oldPromptProvider);
                logger.info(`Cleared ${oldPromptProvider} from provider pool`);
            }
            if (oldVisionProvider !== newVisionProvider) {
                this.providers.delete(oldVisionProvider);
                logger.info(`Cleared ${oldVisionProvider} from provider pool`);
            }
        }

        // Cache manager automatically handles model changes via cache keys

        const modelsMsg = 'Settings reloaded - Models: '
            + `embedding=${this.embeddingModel}, `
            + `prompt=${this.promptModel}, `
            + `vision=${this.visionModel}`;
        logger.info(modelsMsg);

        const { provider: embProv } = getModelInfo(this.embeddingModel);
        const { provider: prmProv } = getModelInfo(this.promptModel);
        const { provider: visProv } = getModelInfo(this.visionModel);
        const providersMsg = 'Providers (lazy): '
            + `embedding=${embProv}, `
            + `prompt=${prmProv}, `
            + `vision=${visProv}`;
        logger.info(providersMsg);
    }

    /**
     * Clear all cached data
     */
    async clearCache(): Promise<void> {
        await this.cacheManager.clear();
        logger.info('Cache cleared');
    }

    /**
     * Save cache immediately (for shutdown)
     */
    async forceSave(): Promise<void> {
        await this.cacheManager.forceSave();
    }
}
