import * as v from 'valibot';
import {
    DEFAULT_DEBUG_LOGGING,
    DEFAULT_EMBEDDING_MODEL,
    DEFAULT_EMBEDDING_THRESHOLD,
    DEFAULT_PROMPT_MODEL,
    DEFAULT_PROMPT_THRESHOLD,
    DEFAULT_VISION_MODEL,
    DEFAULT_VISION_THRESHOLD,
} from './constants';

/**
 * Valibot schema for application settings
 */
export const settingsSchema = v.object({
    // API Keys
    openaiApiKey: v.optional(v.string(), ''),
    openrouterApiKey: v.optional(v.string(), ''),

    // Model configuration (provider is determined by model selection)
    embeddingModel: v.optional(v.string(), DEFAULT_EMBEDDING_MODEL),
    promptModel: v.optional(v.string(), DEFAULT_PROMPT_MODEL),
    visionModel: v.optional(v.string(), DEFAULT_VISION_MODEL),

    // Analysis thresholds
    embeddingThreshold: v.optional(v.number(), DEFAULT_EMBEDDING_THRESHOLD),
    promptThreshold: v.optional(v.number(), DEFAULT_PROMPT_THRESHOLD),
    visionThreshold: v.optional(v.number(), DEFAULT_VISION_THRESHOLD),

    // General settings
    blockingEnabled: v.optional(v.boolean(), true),

    // Development options
    saveScreenshotsToDownloads: v.optional(v.boolean(), false),
    debugLogging: v.optional(v.boolean(), DEFAULT_DEBUG_LOGGING),

    // Ad blocking rules
    adBlockRules: v.optional(v.array(v.object({
        ruleString: v.string(),
        enabled: v.boolean(),
    })), []),
});

/**
 * TypeScript type inferred from the Valibot schema
 */
export type Settings = v.InferOutput<typeof settingsSchema>;

/**
 * Default settings object
 */
export const DEFAULT_SETTINGS: Settings = {
    openaiApiKey: '',
    openrouterApiKey: '',
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    promptModel: DEFAULT_PROMPT_MODEL,
    visionModel: DEFAULT_VISION_MODEL,
    embeddingThreshold: DEFAULT_EMBEDDING_THRESHOLD,
    promptThreshold: DEFAULT_PROMPT_THRESHOLD,
    visionThreshold: DEFAULT_VISION_THRESHOLD,
    blockingEnabled: true,
    saveScreenshotsToDownloads: false,
    debugLogging: DEFAULT_DEBUG_LOGGING,
    adBlockRules: [],
};

/**
 * Validate and parse settings from unknown data
 * @param data Unknown data to validate
 * @returns Validated settings or default settings if validation fails
 */
export function parseSettings(data: unknown): Settings {
    return v.parse(settingsSchema, data);
}
