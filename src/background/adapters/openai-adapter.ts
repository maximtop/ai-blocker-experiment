import { LLM_PROVIDERS, MAX_TEXT_LENGTH } from '../../shared/constants';
import { createLogger } from '../../shared/logger';
import {
    createImageAnalysisUserPrompt,
    createTextAnalysisUserPrompt,
    IMAGE_ANALYSIS_SYSTEM_PROMPT,
    TEXT_ANALYSIS_SYSTEM_PROMPT,
} from '../../shared/prompts';
import {
    BaseLLMAdapter,
    BaseLLMConfig,
    ImageAnalysisOptions,
    LLMAnalysisResult,
} from './base-llm-adapter';

const logger = createLogger('OpenAIAdapter');

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_COMPLETION_TOKENS = 2000;

/**
 * OpenAI-specific configuration
 */
export interface OpenAIConfig extends BaseLLMConfig {
    apiKey: string;
    embeddingModel: string;
    promptModel: string;
    visionModel: string;
}

/**
 * OpenAI embeddings response
 */
interface OpenAIEmbeddingResponse {
    data: Array<{
        embedding: number[];
    }>;
}

/**
 * OpenAI chat response
 */
interface OpenAIChatResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

/**
 * OpenAI API adapter for LLM operations
 */
export class OpenAIAdapter extends BaseLLMAdapter {
    private apiKey: string;

    /**
     * Create OpenAI adapter
     * @param config Configuration object
     */
    constructor(config: OpenAIConfig) {
        super(LLM_PROVIDERS.OPENAI, config);
        this.apiKey = config.apiKey;
    }

    /**
     * Ensure API key is configured
     * @throws {Error} When API key is not configured
     */
    private ensureApiKey(): void {
        if (!this.apiKey) {
            const msg = 'OpenAI API key not configured. '
                + 'Please set it in extension options.';
            throw new Error(msg);
        }
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
     * Get embedding vector for text using OpenAI API
     * @param text Text to get embedding for
     * @param model Model name to use
     * @returns Embedding vector
     * @throws {Error} When API call fails or response is invalid
     */
    async getEmbedding(text: string, model: string): Promise<number[]> {
        this.ensureApiKey();

        const truncatedText = OpenAIAdapter.truncateText(text);

        try {
            const debugMsg = 'Embedding API call for: "'
                + `${truncatedText.substring(0, 50)}..."`;
            logger.debug(debugMsg);

            const response = await fetch(OPENAI_EMBEDDINGS_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    input: truncatedText,
                    model,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                const errorMsg = 'OpenAI API error: '
                    + `${response.status} ${errorText}`;
                logger.error(errorMsg);
                throw new Error(errorMsg);
            }

            const data = await response.json() as OpenAIEmbeddingResponse;

            if (!data.data || !data.data[0] || !data.data[0].embedding) {
                logger.error('Invalid OpenAI response format:', data);
                throw new Error('Invalid OpenAI response format');
            }

            const { embedding } = data.data[0];
            logger.info(`Embedding success (${embedding.length} dimensions)`);

            return embedding;
        } catch (error) {
            logger.error('Embedding fetch error:', error);
            throw error;
        }
    }

    /**
     * Analyze text using OpenAI Chat API with prompt
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
        this.ensureApiKey();

        const truncatedText = OpenAIAdapter.truncateText(text);

        const systemPrompt = TEXT_ANALYSIS_SYSTEM_PROMPT;
        const userPrompt = createTextAnalysisUserPrompt(
            criteria,
            truncatedText,
        );

        try {
            const debugMsg = 'Chat API call: "'
                + `${userPrompt.substring(0, 100)}..."`;
            logger.debug(debugMsg);

            const response = await fetch(OPENAI_CHAT_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
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
                const errorMsg = 'OpenAI Chat API error: '
                    + `${response.status} ${errorText}`;
                logger.error(errorMsg);
                throw new Error(errorMsg);
            }

            const data = await response.json() as OpenAIChatResponse;

            if (!data.choices || !data.choices[0]
                || !data.choices[0].message) {
                logger.error('Invalid OpenAI Chat response format:', data);
                throw new Error('Invalid OpenAI Chat response format');
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

            // Parse JSON response
            const result = JSON.parse(content) as LLMAnalysisResult;
            return {
                matches: result.matches,
                confidence: result.confidence,
                explanation: result.explanation,
            };
        } catch (error) {
            logger.error('Chat API error:', error);
            throw error;
        }
    }

    /**
     * Analyze image using OpenAI Vision API
     * @param imageData Base64-encoded image data
     * @param criteria Criteria to check against
     * @param model Model name to use
     * @param options Additional options
     * @returns Analysis result
     * @throws {Error} When API call fails or response is invalid
     */
    async analyzeImage(
        imageData: string,
        criteria: string,
        model: string,
        options: ImageAnalysisOptions = {},
    ): Promise<LLMAnalysisResult> {
        this.ensureApiKey();

        const detail = options.detail || 'auto';

        const systemPrompt = IMAGE_ANALYSIS_SYSTEM_PROMPT;
        const userPrompt = createImageAnalysisUserPrompt(criteria);

        try {
            const debugMsg = 'Vision API call: "'
                + `${userPrompt.substring(0, 100)}..."`;
            logger.debug(debugMsg);

            const response = await fetch(OPENAI_CHAT_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: userPrompt },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:image/png;base64,${
                                            imageData}`,
                                        detail,
                                    },
                                },
                            ],
                        },
                    ],
                    max_completion_tokens: MAX_COMPLETION_TOKENS,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                const errorMsg = 'OpenAI Vision API error: '
                    + `${response.status} ${errorText}`;
                logger.error(errorMsg);
                throw new Error(errorMsg);
            }

            const data = await response.json() as OpenAIChatResponse;

            if (!data.choices || !data.choices[0]
                || !data.choices[0].message) {
                const errorMsg = 'Invalid OpenAI Vision response format';
                logger.error(errorMsg, data);
                throw new Error(errorMsg);
            }

            const { content } = data.choices[0].message;
            if (!content || content.trim() === '') {
                logger.warn('Empty vision response (token limit)');
                return {
                    matches: false,
                    confidence: 0.0,
                    explanation: 'Empty response due to token limit',
                };
            }

            const successMsg = 'Vision API success: "'
                + `${content.substring(0, 100)}..."`;
            logger.debug(successMsg);

            // Parse JSON response
            const result = JSON.parse(content) as LLMAnalysisResult;
            return {
                matches: result.matches,
                confidence: result.confidence,
                explanation: result.explanation,
            };
        } catch (error) {
            logger.error('Vision API error:', error);
            throw error;
        }
    }
}
