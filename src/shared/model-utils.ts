import { ALL_MODELS_MAP } from './constants';
import type { ModelOption } from './constants';

/**
 * Get model from unique model ID
 * @param {string} uniqueModelId Unique model ID in "provider:modelName" format
 * @returns {ModelOption} Model object with name and provider
 * @throws {Error} If model ID is not found in registry
 */
export function getModelInfo(uniqueModelId: string): ModelOption {
    const model = ALL_MODELS_MAP[uniqueModelId];
    if (!model) {
        throw new Error(`Model not found in registry: ${uniqueModelId}`);
    }
    return model;
}
