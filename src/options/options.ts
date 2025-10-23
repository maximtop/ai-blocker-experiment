// Options page manager - Handles API key management and settings

import {
    ACTIONS,
    ALL_MODELS_MAP,
    EMBEDDING_MODELS,
    LLM_PROVIDERS,
    PROMPT_MODELS,
    VISION_MODELS,
} from '../shared/constants';
import type { LLMProvider } from '../shared/constants';
import { createLogger } from '../shared/logger';
import { Messaging } from '../shared/messaging';
import type { Settings } from '../shared/settings-schema';
import { Storage } from '../shared/storage';

const logger = createLogger('Options');

/**
 * UI status type constants (used multiple times for type checking)
 */
const STATUS_TYPE = {
    SUCCESS: 'success' as const,
    ERROR: 'error' as const,
    WARNING: 'warning' as const,
};

/**
 * Only truly repeated strings (used in 2+ places)
 */
const REPEATED_MESSAGES = {
    NO_API_KEY: 'No API key - using free local models',
    UNKNOWN_ERROR: 'Unknown error',
};

/**
 * Status type for UI feedback
 */
type StatusType = 'success' | 'error' | 'warning';

/**
 * Get human-readable provider label for UI display
 * @param provider The provider
 * @returns Friendly provider name
 */
function getProviderLabel(provider: LLMProvider): string {
    switch (provider) {
        case LLM_PROVIDERS.CHROME_PROMPT:
            return 'Chrome';
        case LLM_PROVIDERS.LMSTUDIO:
            return 'LM Studio';
        case LLM_PROVIDERS.OPENAI:
            return 'OpenAI';
        case LLM_PROVIDERS.OPENROUTER:
            return 'OpenRouter';
        default:
            return provider;
    }
}

/**
 * Generate a model label for UI display
 * @param modelId The model ID
 * @param provider The provider
 * @returns Formatted label like "model-name (Provider)"
 */
function getModelLabel(modelId: string, provider: LLMProvider): string {
    return `${modelId} (${getProviderLabel(provider)})`;
}

/**
 * Options class handles all options page operations
 */
export class Options {
    private embeddingModelSelect!: HTMLSelectElement;

    private promptModelSelect!: HTMLSelectElement;

    private visionModelSelect!: HTMLSelectElement;

    private embeddingModelWarning!: HTMLDivElement;

    private promptModelWarning!: HTMLDivElement;

    private visionModelWarning!: HTMLDivElement;

    private openaiKeyInput!: HTMLInputElement;

    private openrouterKeyInput!: HTMLInputElement;

    private saveScreenshotsCheckbox!: HTMLInputElement;

    private saveBtn!: HTMLButtonElement;

    private clearBtn!: HTMLButtonElement;

    private clearCacheBtn!: HTMLButtonElement;

    private status!: HTMLDivElement;

    /**
     * Initialize the options manager and set up event listeners
     */
    init(): void {
        document.addEventListener('DOMContentLoaded', () => {
            // Get DOM elements
            this.embeddingModelSelect = document.getElementById('embeddingModelSelect') as HTMLSelectElement;
            this.promptModelSelect = document.getElementById('promptModelSelect') as HTMLSelectElement;
            this.visionModelSelect = document.getElementById('visionModelSelect') as HTMLSelectElement;
            this.embeddingModelWarning = document.getElementById('embeddingModelWarning') as HTMLDivElement;
            this.promptModelWarning = document.getElementById('promptModelWarning') as HTMLDivElement;
            this.visionModelWarning = document.getElementById('visionModelWarning') as HTMLDivElement;
            this.openaiKeyInput = document.getElementById('openaiKey') as HTMLInputElement;
            this.openrouterKeyInput = document.getElementById('openrouterKey') as HTMLInputElement;
            this.saveScreenshotsCheckbox = document.getElementById(
                'saveScreenshotsCheckbox',
            ) as HTMLInputElement;
            this.saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
            this.clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
            this.clearCacheBtn = document.getElementById('clearCacheBtn') as HTMLButtonElement;
            this.status = document.getElementById('status') as HTMLDivElement;

            // Populate model dropdowns
            this.populateModelSelects();

            // Load settings
            this.loadSettings();

            // Set up event listeners
            this.setupEventListeners();

            logger.info('Options manager initialized');
        });
    }

    /**
     * Populate model select dropdowns from constants
     */
    private populateModelSelects(): void {
        this.populateModelSelect(
            this.embeddingModelSelect,
            EMBEDDING_MODELS,
        );
        this.populateModelSelect(
            this.promptModelSelect,
            PROMPT_MODELS,
        );
        this.populateModelSelect(
            this.visionModelSelect,
            VISION_MODELS,
        );
    }

    /**
     * Populate a single model select element
     * @param selectElement The select element to populate
     * @param modelIds Array of model IDs
     */
    private populateModelSelect(
        selectElement: HTMLSelectElement,
        modelIds: string[],
    ): void {
        // Get models from registry and group by provider
        const chromePromptModels: string[] = [];
        const lmstudioModels: string[] = [];
        const openaiModels: string[] = [];
        const openrouterModels: string[] = [];

        modelIds.forEach((id) => {
            const model = ALL_MODELS_MAP[id];
            if (!model) {
                return;
            }

            if (model.provider === LLM_PROVIDERS.CHROME_PROMPT) {
                chromePromptModels.push(id);
            } else if (model.provider === LLM_PROVIDERS.LMSTUDIO) {
                lmstudioModels.push(id);
            } else if (model.provider === LLM_PROVIDERS.OPENAI) {
                openaiModels.push(id);
            } else if (model.provider === LLM_PROVIDERS.OPENROUTER) {
                openrouterModels.push(id);
            }
        });

        // Create Chrome Prompt optgroup if there are models
        if (chromePromptModels.length > 0) {
            const chromeGroup = document.createElement('optgroup');
            chromeGroup.label = '🌐 Chrome Built-in AI (Local - Free & Private)';
            chromePromptModels.forEach((modelId) => {
                const model = ALL_MODELS_MAP[modelId];
                if (!model) {
                    return;
                }
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = getModelLabel(model.name, model.provider);
                chromeGroup.appendChild(option);
            });
            selectElement.appendChild(chromeGroup);
        }

        // Create LM Studio optgroup if there are models
        if (lmstudioModels.length > 0) {
            const lmstudioGroup = document.createElement('optgroup');
            lmstudioGroup.label = '🏠 LM Studio (Local - Free)';
            lmstudioModels.forEach((modelId) => {
                const model = ALL_MODELS_MAP[modelId];
                if (!model) {
                    return;
                }
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = getModelLabel(model.name, model.provider);
                lmstudioGroup.appendChild(option);
            });
            selectElement.appendChild(lmstudioGroup);
        }

        // Create OpenAI optgroup if there are models
        if (openaiModels.length > 0) {
            const openaiGroup = document.createElement('optgroup');
            openaiGroup.label = '☁️ OpenAI (Cloud - Requires API Key)';
            openaiModels.forEach((modelId) => {
                const model = ALL_MODELS_MAP[modelId];
                if (!model) {
                    return;
                }
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = getModelLabel(model.name, model.provider);
                openaiGroup.appendChild(option);
            });
            selectElement.appendChild(openaiGroup);
        }

        // Create OpenRouter optgroup if there are models
        if (openrouterModels.length > 0) {
            const openrouterGroup = document.createElement('optgroup');
            openrouterGroup.label = '🌍 OpenRouter (Cloud - Requires API Key)';
            openrouterModels.forEach((modelId) => {
                const model = ALL_MODELS_MAP[modelId];
                if (!model) {
                    return;
                }
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = getModelLabel(model.name, model.provider);
                openrouterGroup.appendChild(option);
            });
            selectElement.appendChild(openrouterGroup);
        }
    }

    /**
     * Set up all event listeners
     */
    private setupEventListeners(): void {
        this.saveBtn.addEventListener('click', () => this.saveSettings());
        this.clearBtn.addEventListener('click', () => this.clearAllData());
        this.clearCacheBtn.addEventListener(
            'click',
            () => this.clearEmbeddingCache(),
        );

        // Auto-save when models change and update warnings
        this.embeddingModelSelect.addEventListener('change', () => {
            this.updateModelWarnings();
            this.saveSettings();
        });
        this.promptModelSelect.addEventListener('change', () => {
            this.updateModelWarnings();
            this.saveSettings();
        });
        this.visionModelSelect.addEventListener('change', () => {
            this.updateModelWarnings();
            this.saveSettings();
        });

        // Update model warnings when API keys change
        this.openaiKeyInput.addEventListener('input', () => {
            this.updateModelWarnings();
        });

        this.openrouterKeyInput.addEventListener('input', () => {
            this.updateModelWarnings();
        });
    }

    /**
     * Load settings from storage with validation
     */
    private async loadSettings(): Promise<void> {
        try {
            // Load validated settings from background script
            const response = await Messaging.sendMessage({
                action: ACTIONS.GET_SETTINGS,
            });

            if (!response.success) {
                throw new Error(response.error || 'Failed to load settings');
            }

            const { settings } = response;

            // Set model selectors - settings already store unique IDs
            this.embeddingModelSelect.value = settings.embeddingModel;
            this.promptModelSelect.value = settings.promptModel;
            this.visionModelSelect.value = settings.visionModel;

            // Load OpenAI API key
            if (settings.openaiApiKey) {
                this.openaiKeyInput.value = settings.openaiApiKey;
            }

            // Load OpenRouter API key
            if (settings.openrouterApiKey) {
                this.openrouterKeyInput.value = settings.openrouterApiKey;
            }

            // Load screenshot setting
            const shouldSave = settings.saveScreenshotsToDownloads;
            this.saveScreenshotsCheckbox.checked = shouldSave;

            // Update model warnings after loading
            this.updateModelWarnings();

            logger.info('Settings loaded and validated');
        } catch (error) {
            logger.error('Failed to load settings:', error);
            this.showStatus('Failed to load settings', STATUS_TYPE.ERROR);
        }
    }

    /**
     * Check if a model requires OpenAI API key
     * @param modelValue Combined "provider:model" string
     * @returns True if model requires OpenAI API key
     */
    private requiresOpenAIKey(modelValue: string): boolean {
        return modelValue.startsWith('openai:');
    }

    /**
     * Check if a model requires OpenRouter API key
     * @param modelValue Combined "provider:model" string
     * @returns True if model requires OpenRouter API key
     */
    private requiresOpenRouterKey(modelValue: string): boolean {
        return modelValue.startsWith('openrouter:');
    }

    /**
     * Update model warnings based on selections and API key status
     */
    private updateModelWarnings(): void {
        const hasOpenAIKey = this.openaiKeyInput.value.trim().length > 0;
        const hasOpenRouterKey = (
            this.openrouterKeyInput.value.trim().length > 0
        );

        // Embedding model warning
        const embeddingNeedsOpenAI = this.requiresOpenAIKey(
            this.embeddingModelSelect.value,
        );
        const embeddingNeedsOpenRouter = this.requiresOpenRouterKey(
            this.embeddingModelSelect.value,
        );
        if (embeddingNeedsOpenAI && !hasOpenAIKey) {
            this.embeddingModelWarning.innerHTML = (
                '⚠️ <strong>OpenAI API Key Required</strong><br>'
                + 'This model requires an OpenAI API key. '
                + 'Please add your API key below or switch to a free model.'
            );
            this.embeddingModelWarning.classList.add('show');
        } else if (embeddingNeedsOpenRouter && !hasOpenRouterKey) {
            this.embeddingModelWarning.innerHTML = (
                '⚠️ <strong>OpenRouter API Key Required</strong><br>'
                + 'This model requires an OpenRouter API key. '
                + 'Please add your API key below or switch to a free model.'
            );
            this.embeddingModelWarning.classList.add('show');
        } else {
            this.embeddingModelWarning.classList.remove('show');
        }

        // LLM model warning
        const llmNeedsOpenAI = this.requiresOpenAIKey(
            this.promptModelSelect.value,
        );
        const llmNeedsOpenRouter = this.requiresOpenRouterKey(
            this.promptModelSelect.value,
        );
        if (llmNeedsOpenAI && !hasOpenAIKey) {
            this.promptModelWarning.innerHTML = (
                '⚠️ <strong>OpenAI API Key Required</strong><br>'
                + 'This model requires an OpenAI API key. '
                + 'Please add your API key below or switch to a free model.'
            );
            this.promptModelWarning.classList.add('show');
        } else if (llmNeedsOpenRouter && !hasOpenRouterKey) {
            this.promptModelWarning.innerHTML = (
                '⚠️ <strong>OpenRouter API Key Required</strong><br>'
                + 'This model requires an OpenRouter API key. '
                + 'Please add your API key below or switch to a free model.'
            );
            this.promptModelWarning.classList.add('show');
        } else {
            this.promptModelWarning.classList.remove('show');
        }

        // Vision model warning
        const visionNeedsOpenAI = this.requiresOpenAIKey(
            this.visionModelSelect.value,
        );
        const visionNeedsOpenRouter = this.requiresOpenRouterKey(
            this.visionModelSelect.value,
        );
        if (visionNeedsOpenAI && !hasOpenAIKey) {
            this.visionModelWarning.innerHTML = (
                '⚠️ <strong>OpenAI API Key Required</strong><br>'
                + 'This model requires an OpenAI API key. '
                + 'Please add your API key below.'
            );
            this.visionModelWarning.classList.add('show');
        } else if (visionNeedsOpenRouter && !hasOpenRouterKey) {
            this.visionModelWarning.innerHTML = (
                '⚠️ <strong>OpenRouter API Key Required</strong><br>'
                + 'This model requires an OpenRouter API key. '
                + 'Please add your API key below.'
            );
            this.visionModelWarning.classList.add('show');
        } else {
            this.visionModelWarning.classList.remove('show');
        }
    }

    /**
     * Return value as-is (already in unique ID format)
     * @param value Unique model ID
     * @returns The unique model ID
     */
    private parseModelValue(value: string): string {
        return value;
    }

    /**
     * Save settings to storage with validation
     */
    private async saveSettings(): Promise<void> {
        const openaiKey = this.openaiKeyInput.value.trim();
        const openrouterKey = this.openrouterKeyInput.value.trim();

        // API keys are optional
        if (openaiKey && !openaiKey.startsWith('sk-')) {
            this.showStatus('Invalid OpenAI API key format. OpenAI keys start with "sk-"', STATUS_TYPE.ERROR);
            return;
        }

        if (openrouterKey && !openrouterKey.startsWith('sk-')) {
            this.showStatus('Invalid OpenRouter API key format. OpenRouter keys start with "sk-"', STATUS_TYPE.ERROR);
            return;
        }

        try {
            // Parse model selections only if they have values
            // Models are optional - not selected means features won't work
            const settings: Partial<Settings> = {
                openaiApiKey: openaiKey,
                openrouterApiKey: openrouterKey,
                saveScreenshotsToDownloads:
                    this.saveScreenshotsCheckbox.checked,
            };

            // Only include embedding model if selected
            // Provider is determined by the model itself, not stored separately
            if (this.embeddingModelSelect.value) {
                settings.embeddingModel = this.parseModelValue(
                    this.embeddingModelSelect.value,
                );
            }

            // Only include prompt model if selected
            if (this.promptModelSelect.value) {
                settings.promptModel = this.parseModelValue(
                    this.promptModelSelect.value,
                );
            }

            // Only include vision model if selected
            if (this.visionModelSelect.value) {
                settings.visionModel = this.parseModelValue(
                    this.visionModelSelect.value,
                );
            }

            // Save with automatic validation via background script
            type UpdateResponse = { success: boolean; error?: string };
            const response = await Messaging.sendMessage({
                action: ACTIONS.UPDATE_SETTINGS,
                updates: settings,
            }) as UpdateResponse;

            if (!response.success) {
                throw new Error(response.error || 'Failed to save settings');
            }

            this.showStatus('Settings saved successfully!', STATUS_TYPE.SUCCESS);

            logger.info('Settings saved and validated');
        } catch (error) {
            logger.error('Failed to save settings:', error);
            const errorMsg = error instanceof Error
                ? error.message
                : REPEATED_MESSAGES.UNKNOWN_ERROR;
            this.showStatus(
                `Failed to save settings: ${errorMsg}`,
                STATUS_TYPE.ERROR,
            );
        }
    }

    /**
     * Clear all data
     */
    private async clearAllData(): Promise<void> {
        const confirmMessage = `⚠️ CLEAR ALL DATA ⚠️

This will permanently delete:
• Your OpenAI API key
• All blocking rules you created
• Embedding & LLM model settings
• All cached embeddings and analysis data

This action CANNOT be undone!

Are you absolutely sure you want to continue?`;

        // eslint-disable-next-line no-restricted-globals, no-alert
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            // Clear all storage
            await Storage.clear();

            // Reset to defaults via background script
            const response = await Messaging.sendMessage({
                action: ACTIONS.UPDATE_SETTINGS,
                updates: {},
            });

            if (!response.success) {
                throw new Error(response.error || 'Failed to reset settings');
            }

            await this.loadSettings();

            this.showStatus('All data cleared successfully', STATUS_TYPE.SUCCESS);
            logger.info('All data cleared');
        } catch (error) {
            logger.error('Failed to clear data:', error);
            this.showStatus('Failed to clear data', STATUS_TYPE.ERROR);
        }
    }

    /**
     * Clear analysis cache (embeddings, prompts, and images)
     */
    private async clearEmbeddingCache(): Promise<void> {
        const confirmMessage = `Clear Analysis Cache?

This will remove all cached items (embeddings, prompts, and images).

Your API key, rules, and settings will NOT be affected.

You may want to do this if:
• You changed the embedding or LLM model
• Cache is taking too much storage
• You're experiencing issues

Continue?`;

        // eslint-disable-next-line no-alert, no-restricted-globals
        if (!confirm(confirmMessage)) {
            return;
        }

        const response = await Messaging.sendMessage({
            action: ACTIONS.CLEAR_EMBEDDING_CACHE,
        });

        if (response.success) {
            this.showStatus(
                '✅ Analysis cache cleared',
                STATUS_TYPE.SUCCESS,
            );
            logger.info('Analysis cache cleared');
        } else {
            this.showStatus(
                `Failed to clear cache: ${response.error}`,
                STATUS_TYPE.ERROR,
            );
        }
    }

    /**
     * Show status message
     * @param message Status message
     * @param type Status type (success, error, warning)
     */
    private showStatus(message: string, type: StatusType): void {
        this.status.textContent = message;
        this.status.className = `status ${type}`;
        this.status.style.display = 'block';

        if (type === STATUS_TYPE.SUCCESS) {
            setTimeout(() => {
                this.status.style.display = 'none';
            }, 3000);
        }
    }
}
