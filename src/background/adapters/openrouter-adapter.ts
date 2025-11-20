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

const logger = createLogger('OpenRouterAdapter');

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_COMPLETION_TOKENS = 2000;

/**
 * JSON Schema for LLM analysis responses
 * Used for structured outputs to enforce valid JSON format
 */
const ANALYSIS_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        matches: {
            type: 'boolean',
            description: 'Whether the content matches the given criteria',
        },
        confidence: {
            type: 'number',
            description: 'Confidence level between 0.0 and 1.0',
            minimum: 0.0,
            maximum: 1.0,
        },
        explanation: {
            type: 'string',
            description: 'Brief explanation of the decision',
        },
    },
    required: ['matches', 'confidence', 'explanation'],
    additionalProperties: false,
} as const;

/**
 * OpenRouter-specific configuration
 */
export interface OpenRouterConfig extends BaseLLMConfig {
    apiKey: string;
    promptModel: string;
    visionModel: string;
}

/**
 * OpenRouter chat response (OpenAI-compatible format)
 */
interface OpenRouterChatResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        cost?: number;
    };
}

/**
 * OpenRouter API adapter for LLM operations
 * OpenRouter uses OpenAI-compatible API format
 */
export class OpenRouterAdapter extends BaseLLMAdapter {
    private apiKey: string;

    /**
     * Create OpenRouter adapter
     * @param config Configuration object
     */
    constructor(config: OpenRouterConfig) {
        super(LLM_PROVIDERS.OPENROUTER, config);
        this.apiKey = config.apiKey;
    }

    /**
     * Ensure API key is configured
     * @throws {Error} When API key is not configured
     */
    private ensureApiKey(): void {
        if (!this.apiKey) {
            const msg = 'OpenRouter API key not configured. '
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
     * Strip markdown code blocks and fix invalid JSON escape sequences
     * Some models wrap JSON in ```json ... ``` blocks and incorrectly escape single quotes
     * @param content Response content
     * @returns Cleaned JSON string
     */
    private static stripMarkdownCodeBlock(content: string): string {
        let cleaned = content.trim();

        // Check if content is wrapped in ```json ... ```
        if (cleaned.startsWith('```json') && cleaned.endsWith('```')) {
            // Extract content between ```json and ```
            const lines = cleaned.split('\n');
            // Remove first line (```json) and last line (```)
            const jsonLines = lines.slice(1, -1);
            cleaned = jsonLines.join('\n');
        } else if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
            // Also handle ```\n{...}\n```
            const lines = cleaned.split('\n');
            // Remove first line (```) and last line (```)
            const jsonLines = lines.slice(1, -1);
            cleaned = jsonLines.join('\n');
        }

        // Fix invalid escape sequences: single quotes don't need escaping in JSON
        // Replace \' with ' (but preserve \\ and other valid escapes)
        cleaned = cleaned.replace(/\\'/g, "'");

        return cleaned.trim();
    }

    /**
     * Extract values from malformed JSON as a fallback
     * @param jsonStr Potentially malformed JSON string
     * @returns Partial analysis result or null if extraction fails
     */
    private static extractFromMalformedJSON(
        jsonStr: string,
    ): LLMAnalysisResult | null {
        try {
            // Try to extract matches value
            const matchesMatch = jsonStr.match(
                /"matches"\s*:\s*(true|false)/,
            );
            const matches = matchesMatch?.[1] === 'true';

            // Try to extract confidence value
            const confidenceMatch = jsonStr.match(
                /"confidence"\s*:\s*([0-9.]+)/,
            );
            const confidence = confidenceMatch?.[1]
                ? parseFloat(confidenceMatch[1])
                : 0.5;

            if (matchesMatch) {
                logger.warn('Extracted partial result from malformed JSON');
                return {
                    matches,
                    confidence,
                    explanation: 'Partial result - explanation unavailable due to malformed JSON',
                };
            }
        } catch (error) {
            logger.error('Failed to extract from malformed JSON:', error);
        }
        return null;
    }

    /**
     * Parse LLM response with better error handling
     * @param content Response content
     * @returns Object with parsed result and whether there was a JSON error
     * @throws {Error} When JSON parsing fails and extraction fails
     */
    private static parseLLMResponse(
        content: string,
    ): { result: LLMAnalysisResult; hadJsonError: boolean } {
        const cleanedContent = OpenRouterAdapter
            .stripMarkdownCodeBlock(content);

        try {
            // Try parsing as-is
            const result = JSON.parse(cleanedContent) as LLMAnalysisResult;
            return { result, hadJsonError: false };
        } catch (parseError) {
            // Log the problematic content for debugging
            logger.error('Failed to parse JSON response:');
            logger.error('Raw content:', content);
            logger.error('Cleaned content:', cleanedContent);
            logger.error('Parse error:', parseError);

            // Try to extract values from malformed JSON as fallback
            const extracted = OpenRouterAdapter.extractFromMalformedJSON(
                cleanedContent,
            );

            if (extracted) {
                return { result: extracted, hadJsonError: true };
            }

            // If all recovery attempts fail, throw error
            throw new Error(
                `Failed to parse LLM response as JSON: ${
                    parseError instanceof Error
                        ? parseError.message
                        : 'Unknown error'
                }`,
            );
        }
    }

    /**
     * Get embedding vector for text
     * OpenRouter doesn't provide embedding endpoints, only chat completions
     * @throws {Error} Always throws as embeddings are not supported
     */
    async getEmbedding(): Promise<number[]> {
        throw new Error(
            'OpenRouter does not support embeddings. '
            + 'Use OpenAI or LM Studio for embedding operations.',
        );
    }

    /**
     * Analyze text using OpenRouter Chat API with prompt
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

        const truncatedText = OpenRouterAdapter.truncateText(text);

        const systemPrompt = TEXT_ANALYSIS_SYSTEM_PROMPT;
        const userPrompt = createTextAnalysisUserPrompt(
            criteria,
            truncatedText,
        );

        try {
            const debugMsg = 'Chat API call: "'
        + `${userPrompt.substring(0, 100)}..."`;
            logger.debug(debugMsg);

            const response = await fetch(OPENROUTER_CHAT_URL, {
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
                    max_tokens: MAX_COMPLETION_TOKENS,
                    response_format: {
                        type: 'json_schema',
                        json_schema: {
                            name: 'content_analysis',
                            strict: true,
                            schema: ANALYSIS_RESPONSE_SCHEMA,
                        },
                    },
                    usage: {
                        include: true,
                    },
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                const errorMsg = 'OpenRouter Chat API error: '
          + `${response.status} ${errorText}`;
                logger.error(errorMsg);
                throw new Error(errorMsg);
            }

            const data = await response.json() as OpenRouterChatResponse;

            if (
                !data.choices
                || !data.choices[0]
                || !data.choices[0].message
            ) {
                logger.error('Invalid OpenRouter Chat response format:', data);
                throw new Error('Invalid OpenRouter Chat response format');
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

            // Parse JSON response (strip markdown code blocks if present)
            const { result, hadJsonError } = OpenRouterAdapter.parseLLMResponse(
                content,
            );

            // Extract usage data if available
            const usage = data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
                cost: data.usage.cost,
            } : undefined;

            return {
                matches: result.matches,
                confidence: result.confidence,
                explanation: result.explanation,
                usage,
                hadJsonError,
            };
        } catch (error) {
            logger.error('Chat API error:', error);
            throw error;
        }
    }

    /**
     * Analyze image using OpenRouter Vision API
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

            const response = await fetch(OPENROUTER_CHAT_URL, {
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
                    max_tokens: MAX_COMPLETION_TOKENS,
                    response_format: {
                        type: 'json_schema',
                        json_schema: {
                            name: 'image_analysis',
                            strict: true,
                            schema: ANALYSIS_RESPONSE_SCHEMA,
                        },
                    },
                    usage: {
                        include: true,
                    },
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                const errorMsg = 'OpenRouter Vision API error: '
          + `${response.status} ${errorText}`;
                logger.error(errorMsg);
                throw new Error(errorMsg);
            }

            const data = await response.json() as OpenRouterChatResponse;

            if (
                !data.choices
                || !data.choices[0]
                || !data.choices[0].message
            ) {
                const errorMsg = 'Invalid OpenRouter Vision response format';
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

            // Parse JSON response (strip markdown code blocks if present)
            const { result, hadJsonError } = OpenRouterAdapter.parseLLMResponse(
                content,
            );

            // Extract usage data if available
            const usage = data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
                cost: data.usage.cost,
            } : undefined;

            return {
                matches: result.matches,
                confidence: result.confidence,
                explanation: result.explanation,
                usage,
                hadJsonError,
            };
        } catch (error) {
            logger.error('Vision API error:', error);
            throw error;
        }
    }
}
