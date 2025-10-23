/* eslint-disable class-methods-use-this */
/**
 * Token usage information from LLM API
 */
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number;
}

/**
 * Result from LLM analysis
 */
export interface LLMAnalysisResult {
    matches: boolean;
    confidence: number;
    explanation: string;
    usage?: TokenUsage;
    hadJsonError?: boolean;
}

/**
 * Options for image analysis
 */
export interface ImageAnalysisOptions {
    detail?: string;
}

/**
 * Base configuration for LLM adapters
 */
export interface BaseLLMConfig {
    apiKey?: string;
    embeddingModel?: string;
    promptModel?: string;
    visionModel?: string;
    [key: string]: unknown;
}

/**
 * Base class for LLM provider adapters
 * All provider adapters must extend this class and implement
 * its abstract methods
 */
export abstract class BaseLLMAdapter {
    protected providerName: string;

    protected config: BaseLLMConfig;

    /**
     * Create a new LLM adapter
     * @param providerName Name of the provider
     * @param config Provider configuration
     */
    constructor(providerName: string, config: BaseLLMConfig) {
        if (this.constructor === BaseLLMAdapter) {
            const msg = 'BaseLLMAdapter is abstract and '
        + 'cannot be instantiated';
            throw new Error(msg);
        }

        this.providerName = providerName;
        this.config = config;
    }

    /**
     * Get embedding vector for text
     * @param text Text to get embedding for
     * @param model Model name to use
     * @returns Embedding vector
     * @throws {Error} Must be implemented by subclass
     */
    abstract getEmbedding(text: string, model: string): Promise<number[]>;

    /**
     * Analyze text using LLM prompt
     * @param text Text to analyze
     * @param criteria Criteria to check against
     * @param model Model name to use
     * @returns Analysis result
     * @throws {Error} Must be implemented by subclass
     */
    abstract analyzeWithPrompt(
        text: string,
        criteria: string,
        model: string,
    ): Promise<LLMAnalysisResult>;

    /**
     * Analyze image using vision model
     * @param imageData Base64-encoded image data
     * @param criteria Criteria to check against
     * @param model Model name to use
     * @param options Additional options (detail level)
     * @returns Analysis result
     * @throws {Error} Must be implemented by subclass
     */
    abstract analyzeImage(
        imageData: string,
        criteria: string,
        model: string,
        options?: ImageAnalysisOptions,
    ): Promise<LLMAnalysisResult>;
}
