import { LLM_PROVIDERS, MAX_TEXT_LENGTH } from '../../shared/constants';
import { createLogger } from '../../shared/logger';
import {
    createTextAnalysisUserPrompt,
    TEXT_ANALYSIS_SYSTEM_PROMPT,
} from '../../shared/prompts';
import {
    BaseLLMAdapter,
    BaseLLMConfig,
    ImageAnalysisOptions,
    LLMAnalysisResult,
} from './base-llm-adapter';

const logger = createLogger('LMStudioAdapter');

const LMSTUDIO_BASE_URL = 'http://localhost:1234';
const LMSTUDIO_EMBEDDINGS_URL = `${LMSTUDIO_BASE_URL}/v1/embeddings`;
const LMSTUDIO_CHAT_URL = `${LMSTUDIO_BASE_URL}/v1/chat/completions`;
const MAX_COMPLETION_TOKENS = 2000;

/**
 * LM Studio-specific configuration
 */
export interface LMStudioConfig extends BaseLLMConfig {
    embeddingModel: string;
    promptModel?: string;
}

/**
 * LM Studio embeddings response
 */
interface LMStudioEmbeddingResponse {
    data: Array<{
        embedding: number[];
    }>;
}

/**
 * LM Studio chat response
 */
interface LMStudioChatResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

/**
 * LM Studio adapter for local LLM operations
 * Supports embeddings and chat completions through local LM Studio server
 */
export class LMStudioAdapter extends BaseLLMAdapter {
    /**
     * Create LM Studio adapter
     * @param config Configuration object
     */
    constructor(config: LMStudioConfig) {
        super(LLM_PROVIDERS.LMSTUDIO, config);
    }

    /**
     * Truncate text to maximum length
     * @param text Text to truncate
     * @returns Truncated text
     */
    private static truncateText(text: string): string {
        if (text.length > MAX_TEXT_LENGTH) {
            const truncated = `${text.substring(0, MAX_TEXT_LENGTH)}...`;
            const msg = `Text truncated from ${text.length} `
        + `to ${truncated.length} chars`;
            logger.info(msg);
            return truncated;
        }
        return text;
    }

    /**
     * Get embedding vector for text using LM Studio API
     * @param text Text to get embedding for
     * @param model Model name to use
     * @returns Embedding vector
     * @throws {Error} When API call fails or response is invalid
     */
    async getEmbedding(text: string, model: string): Promise<number[]> {
        const truncatedText = LMStudioAdapter.truncateText(text);

        try {
            return await this.fetchEmbedding(truncatedText, model);
        } catch (error) {
            // Check if error is due to model being unloaded (TTL expiration)
            const isModelNotFound = this.isModelNotFoundError(error);
            if (isModelNotFound) {
                const msg = 'Model not loaded, '
                    + 'waiting for LM Studio JIT loading (5s) and retrying...';
                logger.info(msg);

                // Wait for LM Studio to load the model via JIT
                // Model loading can take 3-5 seconds depending on model size
                await this.sleep(5000);

                // Retry once - LM Studio will have loaded the model
                return this.fetchEmbedding(truncatedText, model);
            }

            throw error;
        }
    }

    /**
     * Fetch embedding from LM Studio API
     * @param text Text to get embedding for
     * @param model Model name to use
     * @returns Embedding vector
     * @throws {Error} When API call fails or response is invalid
     */
    private async fetchEmbedding(
        text: string,
        model: string,
    ): Promise<number[]> {
        const debugMsg = 'LM Studio embedding API call for: "'
            + `${text.substring(0, 50)}..."`;
        logger.debug(debugMsg);

        const response = await fetch(LMSTUDIO_EMBEDDINGS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                input: text,
                model,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            const errorMsg = 'LM Studio API error: '
                + `${response.status} ${errorText}`;
            logger.error(errorMsg);
            throw new Error(errorMsg);
        }

        const data = await response.json() as LMStudioEmbeddingResponse;

        if (!data.data || !data.data[0] || !data.data[0].embedding) {
            logger.error('Invalid LM Studio response format:', data);
            throw new Error('Invalid LM Studio response format');
        }

        const { embedding } = data.data[0];
        logger.info(`Embedding success (${embedding.length} dimensions)`);

        return embedding;
    }

    /**
     * Check if error is due to model not being loaded
     * @param error Error to check
     * @returns True if error is model_not_found
     */
    private isModelNotFoundError(error: unknown): boolean {
        if (!(error instanceof Error)) {
            return false;
        }

        const errorMsg = error.message.toLowerCase();
        return errorMsg.includes('model_not_found')
            || errorMsg.includes('no models loaded');
    }

    /**
     * Sleep for specified milliseconds
     * @param ms Milliseconds to sleep
     * @returns Promise that resolves after specified delay
     */
    private async sleep(ms: number): Promise<void> {
        return new Promise((resolve) => { setTimeout(resolve, ms); });
    }

    /**
     * Analyze text using LM Studio Chat API with prompt
     * @param text Text to analyze
     * @param criteria Criteria to check against
     * @param model Model name to use
     * @returns Analysis result
     * @throws {Error} When API call fails or response is invalid
     */
    async analyzeWithPrompt(
        text: string,
        criteria: string,
        model: string,
    ): Promise<LLMAnalysisResult> {
        try {
            return await this.fetchChatAnalysis(text, criteria, model);
        } catch (error) {
            // Check if error is due to model being unloaded (TTL expiration)
            const isModelNotFound = this.isModelNotFoundError(error);
            if (isModelNotFound) {
                const msg = 'Model not loaded, '
                    + 'waiting for LM Studio JIT loading (5s) and retrying...';
                logger.info(msg);

                // Wait for LM Studio to load the model via JIT
                // Model loading can take 3-5 seconds depending on model size
                await this.sleep(5000);

                // Retry once - LM Studio will have loaded the model
                return this.fetchChatAnalysis(text, criteria, model);
            }

            throw error;
        }
    }

    /**
     * Fetch chat analysis from LM Studio API
     * @param text Text to analyze
     * @param criteria Criteria to check against
     * @param model Model name to use
     * @returns Analysis result
     * @throws {Error} When API call fails or response is invalid
     */
    private async fetchChatAnalysis(
        text: string,
        criteria: string,
        model: string,
    ): Promise<LLMAnalysisResult> {
        const truncatedText = LMStudioAdapter.truncateText(text);

        const systemPrompt = TEXT_ANALYSIS_SYSTEM_PROMPT;
        const userPrompt = createTextAnalysisUserPrompt(
            criteria,
            truncatedText,
        );

        const debugMsg = 'LM Studio chat API call: "'
            + `${userPrompt.substring(0, 100)}..."`;
        logger.debug(debugMsg);

        const response = await fetch(LMSTUDIO_CHAT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                max_completion_tokens: MAX_COMPLETION_TOKENS,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            const errorMsg = 'LM Studio Chat API error: '
                + `${response.status} ${errorText}`;
            logger.error(errorMsg);
            throw new Error(errorMsg);
        }

        const data = await response.json() as LMStudioChatResponse;

        if (!data.choices || !data.choices[0]
            || !data.choices[0].message) {
            logger.error('Invalid LM Studio Chat response format:', data);
            throw new Error('Invalid LM Studio Chat response format');
        }

        const { content } = data.choices[0].message;
        if (!content || content.trim() === '') {
            logger.warn('Empty response (likely hit token limit)');
            return {
                matches: false,
                confidence: 0.0,
                explanation: 'Empty response due to token limit',
            };
        }

        const successMsg = `Chat API success: ${content}`;
        logger.debug(successMsg);

        // Strip thinking tags if present (some models output reasoning before JSON)
        // Example: <think>reasoning...</think>{"matches":true,...}
        let jsonContent = content;
        const thinkEndTag = '</think>';
        const thinkEndIndex = content.indexOf(thinkEndTag);
        if (thinkEndIndex !== -1) {
            const offset = thinkEndIndex + thinkEndTag.length;
            jsonContent = content.substring(offset).trim();
            logger.debug('Stripped thinking tags from model response');
        }

        // Parse JSON response
        const result = JSON.parse(jsonContent) as LLMAnalysisResult;
        return {
            matches: result.matches,
            confidence: result.confidence,
            explanation: result.explanation,
        };
    }

    /**
     * Analyze image using LM Studio Vision API
     * @param _imageData Base64-encoded image data
     * @param _criteria Criteria to check against
     * @param _model Model name to use
     * @param _options Additional options
     * @returns Analysis result
     * @throws {Error} Vision models not supported in LM Studio
     */
    async analyzeImage(
        _imageData: string,
        _criteria: string,
        _model: string,
        _options: ImageAnalysisOptions = {},
    ): Promise<LLMAnalysisResult> {
        const errorMsg = 'Vision model analysis not supported in LM Studio';
        logger.error(errorMsg);
        throw new Error(errorMsg);
    }
}
