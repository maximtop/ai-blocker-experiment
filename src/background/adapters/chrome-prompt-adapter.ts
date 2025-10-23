/* eslint-disable @typescript-eslint/no-explicit-any */
import { LLM_PROVIDERS } from '../../shared/constants';
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

const logger = createLogger('ChromePromptAdapter');

/**
 * Chrome Prompt API-specific configuration
 */
export interface ChromePromptConfig extends BaseLLMConfig {
    promptModel: string;
    visionModel: string;
}

/**
 * Chrome Prompt API session interface
 * Represents the browser's built-in LanguageModel session
 */
interface LanguageModelSession {
    prompt(text: string, options?: any): Promise<string>;
    destroy(): void;
    inputUsage: number;
    inputQuota: number;
}

/**
 * Chrome LanguageModel API interface
 * Global API for creating sessions and checking availability
 */
interface LanguageModel {
    create(options?: any): Promise<LanguageModelSession>;
    availability(): Promise<string>;
    params(): Promise<{
        defaultTemperature: number;
        maxTemperature: number;
        defaultTopK: number;
        maxTopK: number;
    }>;
}

/**
 * Extend global interfaces to include Chrome's LanguageModel API
 * For extension service workers, use globalThis.LanguageModel or globalThis.ai.languageModel
 */
declare global {
    // eslint-disable-next-line no-var, @typescript-eslint/naming-convention, vars-on-top
    var LanguageModel: LanguageModel | undefined;

    // eslint-disable-next-line no-var, @typescript-eslint/naming-convention, vars-on-top
    var ai: {
        languageModel?: LanguageModel;
    } | undefined;
}

/**
 * Chrome Prompt API availability states
 * Chrome returns: "available", "after-download", "downloading", or "no"
 */
const AVAILABILITY = {
    AVAILABLE: 'available', // Model is ready to use
    AFTER_DOWNLOAD: 'after-download', // Model available after download
    DOWNLOADING: 'downloading', // Model is downloading
    NO: 'no', // Model not available
} as const;

/**
 * Chrome Prompt API adapter for built-in AI
 * Uses Gemini Nano model running locally in Chrome
 */
export class ChromePromptAdapter extends BaseLLMAdapter {
    private sessionParams: {
        defaultTemperature: number;
        maxTemperature: number;
        defaultTopK: number;
        maxTopK: number;
    } | null = null;

    /**
     * Mutex for serializing vision analysis requests
     * Chrome Prompt API has race conditions with concurrent vision sessions
     */
    private visionMutex: Promise<void> = Promise.resolve();

    /**
     * Create Chrome Prompt adapter
     * @param config Configuration object
     */
    constructor(config: ChromePromptConfig) {
        super(LLM_PROVIDERS.CHROME_PROMPT, config);
    }

    /**
     * Retrieve the LanguageModel API from globalThis if available
     * Works in both service workers and regular contexts via globalThis
     * @returns LanguageModel API instance or undefined if not available
     */
    private getLanguageModelAPIOrUndefined(): LanguageModel | undefined {
        return globalThis.LanguageModel
            || globalThis.ai?.languageModel;
    }

    /**
     * Get the LanguageModel API
     * Works in both service workers and regular contexts via globalThis
     * @returns LanguageModel API instance
     * @throws {Error} When API is not available
     */
    private getLanguageModelAPI(): LanguageModel {
        const api = this.getLanguageModelAPIOrUndefined();

        if (!api) {
            const msg = 'Chrome Prompt API not available. '
                + 'Requires Chrome 138+ with built-in AI enabled. '
                + 'For extensions, enable chrome://flags/#prompt-api-for-gemini-nano '
                + 'and restart Chrome completely.';
            throw new Error(msg);
        }

        return api;
    }

    /**
     * Validate model availability and throw appropriate error if not ready
     * @param availability Current availability state
     * @param isVision Whether this is for vision analysis (affects error messages)
     * @throws {Error} When model is not ready for use
     */
    private validateAvailability(availability: string, isVision = false): void {
        const isReady = availability === AVAILABILITY.AVAILABLE;

        if (isReady) {
            return;
        }

        if (availability === AVAILABILITY.NO) {
            if (isVision) {
                throw new Error(
                    'Chrome Prompt API vision support is not available. '
                    + 'Vision capabilities are still experimental and require:\n'
                    + '  • Chrome 131-136 with Prompt API origin trial token, OR\n'
                    + '  • Chrome 137+ with vision features enabled\n'
                    + '  • Check chrome://on-device-internals for model capabilities\n'
                    + 'Recommendation: Use OpenAI (gpt-4o/gpt-4o-mini) or OpenRouter '
                    + '(google/gemini-flash-1.5) for vision analysis instead.',
                );
            }
            throw new Error(
                'Chrome Prompt API is not available on this device. '
                + 'Check hardware requirements: '
                + '22GB free space, 4GB+ VRAM or 16GB+ RAM.',
            );
        }

        const modelType = isVision ? 'Gemini Nano vision model' : 'Gemini Nano model';

        if (availability === AVAILABILITY.AFTER_DOWNLOAD) {
            throw new Error(
                `${modelType} needs to be downloaded before use. `
                + 'Model will download on first analysis (~22GB, 10-30 minutes).',
            );
        }

        if (availability === AVAILABILITY.DOWNLOADING) {
            throw new Error(
                `${modelType} is currently downloading. `
                + 'Please wait for download to complete.',
            );
        }

        if (isVision) {
            throw new Error(
                'Chrome Prompt API vision support is not available. '
                + 'Vision capabilities are still experimental and require:\n'
                + '  • Chrome 131-136 with Prompt API origin trial token, OR\n'
                + '  • Chrome 137+ with vision features enabled\n'
                + '  • Check chrome://on-device-internals for model capabilities\n'
                + 'Recommendation: Use OpenAI (gpt-4o/gpt-4o-mini) or OpenRouter '
                + '(google/gemini-flash-1.5) for vision analysis instead.',
            );
        }
        throw new Error(
            `Gemini Nano model is not ready. Current state: "${availability}". `
            + 'Expected state: "available". '
            + 'Please check chrome://on-device-internals for model status.',
        );
    }

    /**
     * Check availability and download status of the model
     * @returns Availability state
     */
    private async checkAvailability(): Promise<string> {
        try {
            logger.info('Checking Gemini Nano availability...');
            const api = this.getLanguageModelAPI();
            const availability = await api.availability();
            logger.info(`✓ Model availability status: ${availability}`);
            return availability;
        } catch (error) {
            logger.error('Failed to check availability:', error);
            return AVAILABILITY.NO;
        }
    }

    /**
     * Ensure session parameters are loaded
     * Fetches model parameters on first call
     * @throws {Error} When parameters cannot be fetched
     */
    private async ensureSessionParams(): Promise<void> {
        if (this.sessionParams) {
            return;
        }

        const availability = await this.checkAvailability();

        if (availability === AVAILABILITY.NO) {
            const msg = 'Chrome Prompt API is not available on this device. '
                + 'Check hardware requirements: '
                + '22GB free space, 4GB+ VRAM or 16GB+ RAM.';
            throw new Error(msg);
        }

        if (availability === AVAILABILITY.AFTER_DOWNLOAD) {
            logger.warn('⚠️  Gemini Nano model needs to be downloaded');
            logger.warn('📥 Model will download on first analysis');
            logger.warn('⏱️  This may take 10-30 minutes on your connection');
        } else if (availability === AVAILABILITY.DOWNLOADING) {
            logger.info('⏳ Gemini Nano model is currently downloading...');
        } else if (
            availability === AVAILABILITY.AVAILABLE
        ) {
            logger.info('✅ Gemini Nano model is ready to use!');
        }

        try {
            const api = this.getLanguageModelAPI();

            logger.info('Fetching model parameters...');
            this.sessionParams = await api.params();
            const paramsMsg = 'Model parameters: '
                + `temp=${this.sessionParams.defaultTemperature}, `
                + `topK=${this.sessionParams.defaultTopK}`;
            logger.info(paramsMsg);
        } catch (error) {
            logger.error('❌ Failed to fetch session parameters:', error);
            if (error instanceof Error) {
                logger.error('Error details:', error.message);
                logger.error('Error stack:', error.stack);
            }
            throw new Error(
                `Failed to fetch Chrome Prompt parameters: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`,
            );
        }
    }

    /**
     * Get embedding vector for text
     * Note: Chrome Prompt API does not support embeddings directly
     * This method throws an error as embeddings are not supported
     * @param _text Text to get embedding for
     * @param _model Model name (ignored)
     * @returns Never returns, always throws
     * @throws {Error} Embeddings not supported by Chrome Prompt API
     */
    async getEmbedding(_text: string, _model: string): Promise<number[]> {
        const msg = 'Chrome Prompt API does not support embeddings. '
            + 'Use OpenAI or LM Studio for embedding-based rules.';
        throw new Error(msg);
    }

    /**
     * Analyze text using Chrome Prompt API
     * @param text Text to analyze
     * @param criteria Criteria to check against
     * @param _model Model name (currently only supports gemini-nano)
     * @returns Analysis result with JSON response
     * @throws {Error} When API call fails or response is invalid
     */
    async analyzeWithPrompt(
        text: string,
        criteria: string,
        _model: string,
    ): Promise<LLMAnalysisResult> {
        // Check availability and validate model is ready
        const availability = await this.checkAvailability();
        this.validateAvailability(availability, false);

        // Ensure we have session params loaded
        await this.ensureSessionParams();

        const systemPrompt = TEXT_ANALYSIS_SYSTEM_PROMPT;
        const userPrompt = createTextAnalysisUserPrompt(criteria, text);

        const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

        // Create a fresh session for each analysis to avoid context accumulation
        const api = this.getLanguageModelAPI();
        const analysisSession = await api.create({
            temperature: this.sessionParams?.defaultTemperature,
            topK: this.sessionParams?.defaultTopK,
            expectedOutputs: [{ type: 'text', languages: ['en'] }],
        });

        try {
            const debugMsg = 'Chrome Prompt analysis: "'
                + `${userPrompt.substring(0, 100)}..."`;
            logger.debug(debugMsg);

            // Use structured output with JSON schema
            const schema = {
                type: 'object',
                properties: {
                    matches: { type: 'boolean' },
                    confidence: { type: 'number' },
                    explanation: { type: 'string' },
                },
                required: ['matches', 'confidence', 'explanation'],
            };

            const response = await analysisSession.prompt(fullPrompt, {
                responseConstraint: schema,
            });

            logger.info(`Chrome Prompt response: ${response}`);

            // Parse JSON response
            const result = JSON.parse(response) as LLMAnalysisResult;
            return {
                matches: result.matches,
                confidence: result.confidence,
                explanation: result.explanation,
            };
        } catch (error) {
            logger.error('Chrome Prompt analysis error:', error);
            throw error;
        } finally {
            // Always clean up the session
            analysisSession.destroy();
        }
    }

    /**
     * Analyze image using Chrome Prompt API vision capabilities
     * @param imageData Base64-encoded image data
     * @param criteria Criteria to check against
     * @param model Model name (currently supports gemini-nano-vision)
     * @param options Additional options (ignored for Chrome Prompt)
     * @returns Analysis result with JSON response
     * @throws {Error} When API call fails or response is invalid
     */
    async analyzeImage(
        imageData: string,
        criteria: string,
        model: string,
        options: ImageAnalysisOptions = {},
    ): Promise<LLMAnalysisResult> {
        // Acquire mutex to serialize vision requests
        // This prevents concurrent sessions from interfering with each other
        const previousMutex = this.visionMutex;
        let resolveMutex: () => void;
        this.visionMutex = new Promise((resolve) => {
            resolveMutex = resolve;
        });

        try {
            // Wait for previous request to complete
            await previousMutex;

            // Now we have exclusive access - perform the analysis
            return await this.analyzeImageInternal(
                imageData,
                criteria,
                model,
                options,
            );
        } finally {
            // Release mutex for next request
            resolveMutex!();
        }
    }

    /**
     * Internal implementation of image analysis (called under mutex)
     * Requires Chrome 131-136 with origin trial or Chrome 137+ with vision enabled
     * @param imageData Base64-encoded image data
     * @param criteria Criteria to check against
     * @param _model Model name (currently supports gemini-nano-vision)
     * @param _options Additional options (ignored for Chrome Prompt)
     * @returns Analysis result with JSON response
     * @throws {Error} When API call fails or response is invalid
     */
    private async analyzeImageInternal(
        imageData: string,
        criteria: string,
        _model: string,
        _options: ImageAnalysisOptions = {},
    ): Promise<LLMAnalysisResult> {
        // IMPORTANT: Vision support requires Chrome 131-136 with origin trial
        // or Chrome 137+ with the feature enabled
        const visionNotSupportedMsg = 'Chrome Prompt API vision support is not available. '
            + 'Vision capabilities are still experimental and require:\n'
            + '  • Chrome 131-136 with Prompt API origin trial token, OR\n'
            + '  • Chrome 137+ with vision features enabled\n'
            + '  • Check chrome://on-device-internals for model capabilities\n'
            + 'Recommendation: Use OpenAI (gpt-4o/gpt-4o-mini) or OpenRouter '
            + '(google/gemini-flash-1.5) for vision analysis instead.';

        // Check availability before proceeding
        const availability = await this.checkAvailability();

        // Only proceed if model is ready
        const isReady = availability === AVAILABILITY.AVAILABLE;

        if (!isReady) {
            if (availability === AVAILABILITY.NO) {
                throw new Error(visionNotSupportedMsg);
            }

            if (availability === AVAILABILITY.AFTER_DOWNLOAD) {
                const msg = 'Gemini Nano vision model needs to be downloaded '
                    + 'before use. Model will download on first analysis '
                    + '(~22GB, 10-30 minutes).';
                throw new Error(msg);
            }

            if (availability === AVAILABILITY.DOWNLOADING) {
                const msg = 'Gemini Nano vision model is currently downloading. '
                + 'Please wait for download to complete.';
                throw new Error(msg);
            }

            // Unknown state
            throw new Error(visionNotSupportedMsg);
        }

        // Ensure we have session params loaded
        await this.ensureSessionParams();

        const systemPrompt = IMAGE_ANALYSIS_SYSTEM_PROMPT;
        const userPrompt = createImageAnalysisUserPrompt(criteria);

        try {
            const debugMsg = 'Chrome Prompt vision analysis: "'
                + `${userPrompt.substring(0, 100)}..."`;
            logger.debug(debugMsg);

            // Convert base64 to Blob for Chrome Prompt API
            const base64Data = imageData.replace(
                /^data:image\/\w+;base64,/,
                '',
            );
            const binaryData = atob(base64Data);
            const bytes = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i += 1) {
                bytes[i] = binaryData.charCodeAt(i);
            }
            const imageBlob = new Blob([bytes], { type: 'image/png' });

            // Create session with multimodal support and language specification
            const api = this.getLanguageModelAPI();

            // Try to create a vision-capable session
            logger.debug('Creating vision session with multimodal support...');
            const visionSession = await api.create({
                temperature: this.sessionParams?.defaultTemperature,
                topK: this.sessionParams?.defaultTopK,
                expectedInputs: [
                    { type: 'image' },
                    { type: 'text', languages: ['en'] },
                ],
                expectedOutputs: [{ type: 'text', languages: ['en'] }],
            });

            // Append image to session context
            await (visionSession as any).append([
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', value: userPrompt },
                        { type: 'image', value: imageBlob },
                    ],
                },
            ]);

            // Use structured output with JSON schema
            const schema = {
                type: 'object',
                properties: {
                    matches: { type: 'boolean' },
                    confidence: { type: 'number' },
                    explanation: { type: 'string' },
                },
                required: ['matches', 'confidence', 'explanation'],
            };

            const response = await visionSession.prompt(
                'Provide your analysis in JSON format.',
                { responseConstraint: schema },
            );

            // Clean up vision session
            visionSession.destroy();

            logger.info(`Chrome Prompt vision response: ${response}`);

            // Parse JSON response
            const result = JSON.parse(response) as LLMAnalysisResult;
            return {
                matches: result.matches,
                confidence: result.confidence,
                explanation: result.explanation,
            };
        } catch (error) {
            logger.error('Chrome Prompt vision error:', error);
            throw error;
        }
    }
}
