// Message handling for background script - Types and message router

import {
    ACTIONS,
    GroundTruthLabel,
    SETTINGS_KEYS,
} from '../shared/constants';
import { createLogger, getErrorMessage } from '../shared/logger';
import type { CropBounds } from '../shared/offscreen-messages';
import type { Rule } from '../shared/rule-types';
import { SettingsManager } from '../shared/settings';
import { Settings } from '../shared/settings-schema';

import { LLMService } from './llm-service';
import { RuleService } from './rule-service';
import { ScreenshotService } from './screenshot-service';

const logger = createLogger('MessageHandler');

/**
 * Element to be analyzed
 */
export interface AnalyzableElement {
    id: string;
    text: string;
    selector: string;
    groundTruth?: GroundTruthLabel;
}

/**
 * Result of matching an element against a rule
 */
export interface ElementRuleMatchResult {
    elementId: string;
    ruleId: string;
    confidence: number;
    rule: Rule;
    element: AnalyzableElement;
}

/**
 * Response types for message handlers
 */
export interface GetBlockingStatusResponse {
    success: boolean;
    blockingEnabled: boolean;
}

export interface GetRulesResponse {
    success: boolean;
    rules: Rule[];
}

export interface ValidateRuleResponse {
    success: boolean;
    valid: boolean;
}

export interface AddRuleResponse {
    success: boolean;
    rule?: Rule;
    error?: string | null;
}

export interface RemoveRuleResponse {
    success: boolean;
}

export interface ToggleRuleResponse {
    success: boolean;
}

export interface GetThresholdsResponse {
    success: boolean;
    embeddingThreshold: number;
    promptThreshold: number;
    visionThreshold: number;
}

export interface SetThresholdResponse {
    success: boolean;
}

/**
 * Message map - couples message structure with response type
 */
export type MessageMap = {
    [ACTIONS.GET_BLOCKING_STATUS]: {
        message: { action: typeof ACTIONS.GET_BLOCKING_STATUS };
        response: GetBlockingStatusResponse;
    };
    [ACTIONS.GET_SETTINGS]: {
        message: { action: typeof ACTIONS.GET_SETTINGS; key?: string };
        response: {
            success: boolean;
            settings: Settings;
            error?: string
        };
    };
    [ACTIONS.UPDATE_SETTINGS]: {
        message: {
            action: typeof ACTIONS.UPDATE_SETTINGS;
            updates: Record<string, unknown>
        };
        response: { success: boolean; error?: string };
    };
    [ACTIONS.CLEAR_EMBEDDING_CACHE]: {
        message: { action: typeof ACTIONS.CLEAR_EMBEDDING_CACHE };
        response: { success: boolean; error?: string };
    };
    [ACTIONS.ADD_RULE]: {
        message: { action: typeof ACTIONS.ADD_RULE; ruleString: string };
        response: AddRuleResponse;
    };
    [ACTIONS.REMOVE_RULE]: {
        message: { action: typeof ACTIONS.REMOVE_RULE; ruleId: string };
        response: RemoveRuleResponse;
    };
    [ACTIONS.TOGGLE_RULE]: {
        message: {
            action: typeof ACTIONS.TOGGLE_RULE;
            ruleId: string;
            enabled: boolean;
        };
        response: ToggleRuleResponse;
    };
    [ACTIONS.VALIDATE_RULE]: {
        message: { action: typeof ACTIONS.VALIDATE_RULE; ruleString: string };
        response: ValidateRuleResponse;
    };
    [ACTIONS.GET_RULES]: {
        message: { action: typeof ACTIONS.GET_RULES };
        response: GetRulesResponse;
    };
    [ACTIONS.GET_THRESHOLDS]: {
        message: { action: typeof ACTIONS.GET_THRESHOLDS };
        response: GetThresholdsResponse;
    };
    [ACTIONS.SET_EMBEDDING_THRESHOLD]: {
        message: {
            action: typeof ACTIONS.SET_EMBEDDING_THRESHOLD;
            threshold: number
        };
        response: SetThresholdResponse;
    };
    [ACTIONS.SET_PROMPT_THRESHOLD]: {
        message: {
            action: typeof ACTIONS.SET_PROMPT_THRESHOLD; threshold: number
        };
        response: SetThresholdResponse;
    };
    [ACTIONS.SET_VISION_THRESHOLD]: {
        message: {
            action: typeof ACTIONS.SET_VISION_THRESHOLD; threshold: number };
        response: SetThresholdResponse;
    };
    [ACTIONS.CAPTURE_PAGE_SCREENSHOT]: {
        message: {
            action: typeof ACTIONS.CAPTURE_PAGE_SCREENSHOT;
            bounds?: unknown;
            criteria?: string;
            cacheInfo?: unknown
        };
        response: unknown;
    };
    [ACTIONS.DOWNLOAD_CANVAS_IMAGE]: {
        message: {
            action: typeof ACTIONS.DOWNLOAD_CANVAS_IMAGE;
            dataUrl: string;
        };
        response: unknown;
    };
    [ACTIONS.ANALYZE_ELEMENTS]: {
        message: {
            action: typeof ACTIONS.ANALYZE_ELEMENTS;
            elements: AnalyzableElement[] };
        response: {
            success: boolean;
            results: ElementRuleMatchResult[];
            error?: string
        }; // FIXME duplication
    };
};

/**
 * Union of all valid action types
 */
type ValidActions = keyof MessageMap;

/**
 * Union of all message types
 */
export type ActionMessage = MessageMap[ValidActions]['message'];

/**
 * MessageHandler class - Routes and handles messages from content scripts
 */
export class MessageHandler {
    private llm: LLMService;

    private rules: RuleService;

    private analyzeElementsBatch: (
        elements: AnalyzableElement[],
        rules: Rule[]
    ) => Promise<ElementRuleMatchResult[]>;

    constructor(
        llmService: LLMService,
        ruleService: RuleService,
        analyzeElementsBatch: (
            elements: AnalyzableElement[],
            rules: Rule[]
        ) => Promise<ElementRuleMatchResult[]>,
    ) {
        this.llm = llmService;
        this.rules = ruleService;
        this.analyzeElementsBatch = analyzeElementsBatch;
    }

    /**
     * Handle incoming message and route to appropriate handler
     * @param message Message from content script
     * @param _sender Message sender information (unused)
     * @param sendResponse Function to send response back
     * @returns True if response will be sent asynchronously
     */
    handle(
        message: ActionMessage,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void,
    ): boolean {
        switch (message.action) {
            case ACTIONS.GET_BLOCKING_STATUS:
                return this.handleGetBlockingStatus(sendResponse);

            case ACTIONS.GET_SETTINGS:
                return this.handleGetSettings(message, sendResponse);

            case ACTIONS.UPDATE_SETTINGS:
                return this.handleUpdateSettings(message, sendResponse);

            case ACTIONS.CLEAR_EMBEDDING_CACHE:
                return this.handleClearEmbeddingCache(sendResponse);

            case ACTIONS.ADD_RULE:
                return this.handleAddRule(message, sendResponse);

            case ACTIONS.REMOVE_RULE:
                return this.handleRemoveRule(message, sendResponse);

            case ACTIONS.GET_RULES:
                return this.handleGetRules(sendResponse);

            case ACTIONS.TOGGLE_RULE:
                return this.handleToggleRule(message, sendResponse);

            case ACTIONS.VALIDATE_RULE:
                return this.handleValidateRule(message, sendResponse);

            case ACTIONS.GET_THRESHOLDS:
                return this.handleGetThresholds(sendResponse);

            case ACTIONS.SET_EMBEDDING_THRESHOLD:
                return this.handleSetEmbeddingThreshold(message, sendResponse);

            case ACTIONS.SET_PROMPT_THRESHOLD:
                return this.handleSetPromptThreshold(message, sendResponse);

            case ACTIONS.SET_VISION_THRESHOLD:
                return this.handleSetVisionThreshold(message, sendResponse);

            case ACTIONS.CAPTURE_PAGE_SCREENSHOT:
                return this.handleCapturePageScreenshot(message, sendResponse);

            case ACTIONS.DOWNLOAD_CANVAS_IMAGE:
                return this.handleDownloadCanvasImage(message, sendResponse);

            case ACTIONS.ANALYZE_ELEMENTS:
                return this.handleAnalyzeElements(message, sendResponse);

            default:
                // No matching action found
                return false;
        }
    }

    /**
     * Handle GET_BLOCKING_STATUS action
     * @param sendResponse Function to send response
     * @returns True for async response
     */
    private handleGetBlockingStatus(
        sendResponse: (response?: unknown) => void,
    ): boolean {
        (async () => {
            const blockingEnabled = await SettingsManager.get(
                SETTINGS_KEYS.BLOCKING_ENABLED,
            );
            sendResponse({
                success: true,
                blockingEnabled,
            });
        })();
        return true; // Async response
    }

    /**
     * Handle GET_SETTINGS action
     * @param message Message with optional settings key
     * @param sendResponse Function to send response
     * @returns True for async response
     */
    private handleGetSettings(
        message: MessageMap[typeof ACTIONS.GET_SETTINGS]['message'],
        sendResponse: (response?: unknown) => void,
    ): boolean {
        (async () => {
            try {
                const { key } = message;
                const value = key && typeof key === 'string'
                    ? await SettingsManager.load()
                    : await SettingsManager.load();
                sendResponse({
                    success: true,
                    settings: value,
                });
            } catch (error) {
                logger.error('Error getting settings:', error);
                sendResponse({
                    success: false,
                    error: getErrorMessage(error),
                });
            }
        })();
        return true; // Async response
    }

    /**
     * Handle UPDATE_SETTINGS action
     * Automatically clears cache if any model changes
     * @param message Message with settings updates
     * @param sendResponse Function to send response
     * @returns True for async response
     */
    private handleUpdateSettings(
        message: MessageMap[typeof ACTIONS.UPDATE_SETTINGS]['message'],
        sendResponse: (response?: unknown) => void,
    ): boolean {
        (async () => {
            try {
                const { updates } = message;

                // Load current settings to detect model changes
                const currentSettings = await SettingsManager.load();

                // Check if any model is being changed
                const embeddingChanged = updates.embeddingModel
                    && updates.embeddingModel
                        !== currentSettings.embeddingModel;
                const promptChanged = updates.promptModel
                    && updates.promptModel !== currentSettings.promptModel;
                const visionChanged = updates.visionModel
                    && updates.visionModel !== currentSettings.visionModel;
                const modelsChanged = embeddingChanged
                    || promptChanged
                    || visionChanged;

                // Check if API keys were added (went from empty to having a value)
                // or changed to a different value
                const openaiKeyAdded = updates.openaiApiKey
                    && updates.openaiApiKey.length > 0
                    && (!currentSettings.openaiApiKey
                        || currentSettings.openaiApiKey.length === 0);
                const openaiKeyChanged = updates.openaiApiKey !== undefined
                    && updates.openaiApiKey !== currentSettings.openaiApiKey
                    && currentSettings.openaiApiKey
                    && currentSettings.openaiApiKey.length > 0;
                const openrouterKeyAdded = updates.openrouterApiKey
                    && updates.openrouterApiKey.length > 0
                    && (!currentSettings.openrouterApiKey
                        || currentSettings.openrouterApiKey.length === 0);
                const openrouterKeyChanged = updates.openrouterApiKey
                        !== undefined
                    && updates.openrouterApiKey
                        !== currentSettings.openrouterApiKey
                    && currentSettings.openrouterApiKey
                    && currentSettings.openrouterApiKey.length > 0;

                const apiKeysChanged = openaiKeyAdded
                    || openaiKeyChanged
                    || openrouterKeyAdded
                    || openrouterKeyChanged;

                // Save the updated settings
                await SettingsManager.update(updates);

                // If models changed, clear cache and reload LLM service settings
                if (modelsChanged) {
                    logger.info('Model changed detected, clearing cache...');
                    await this.llm.clearCache();
                    await this.llm.reloadSettings();
                    logger.info('Cache cleared and settings reloaded due to model change');
                } else if (apiKeysChanged) {
                    // API keys changed but models didn't - just reload settings
                    logger.info('API key changed detected, reloading settings...');
                    await this.llm.reloadSettings();
                    logger.info('Settings reloaded due to API key change');
                }

                sendResponse({ success: true });
            } catch (error) {
                logger.error('Error updating settings:', error);
                sendResponse({
                    success: false,
                    error: getErrorMessage(error),
                });
            }
        })();
        return true; // Async response
    }

    /**
     * Handle CLEAR_EMBEDDING_CACHE action
     * @param sendResponse Function to send response
     * @returns True for async response
     */
    private handleClearEmbeddingCache(
        sendResponse: (response?: unknown) => void,
    ): boolean {
        (async () => {
            try {
                await this.llm.clearCache();
                sendResponse({ success: true });
            } catch (error) {
                logger.warn('Failed to clear cache');
                sendResponse({
                    success: false,
                    error: getErrorMessage(error),
                });
            }
        })();
        return true; // Async response
    }

    /**
     * Handle ADD_RULE action
     * @param message Message with rule string to add
     * @param sendResponse Function to send response
     * @returns True for async response
     */
    private handleAddRule(
        message: MessageMap[typeof ACTIONS.ADD_RULE]['message'],
        sendResponse: (response?: unknown) => void,
    ): boolean {
        (async () => {
            const rule = await this.rules.addRule(
                message.ruleString,
            );
            sendResponse({
                success: !!rule,
                rule,
                error: rule ? null : 'Failed to parse rule',
            });
        })();
        return true; // Async response
    }

    /**
     * Handle REMOVE_RULE action
     * @param message Message with rule ID to remove
     * @param sendResponse Function to send response
     * @returns True for async response
     */
    private handleRemoveRule(
        message: MessageMap[typeof ACTIONS.REMOVE_RULE]['message'],
        sendResponse: (response?: unknown) => void,
    ): boolean {
        (async () => {
            const removed = await this.rules.removeRule(
                message.ruleId,
            );
            sendResponse({ success: removed });
        })();
        return true; // Async response
    }

    /**
     * Handle GET_RULES action
     * @param sendResponse Function to send response
     * @returns False for sync response
     */
    private handleGetRules(
        sendResponse: (response?: unknown) => void,
    ): boolean {
        const rules = this.rules.getRules();
        sendResponse({ success: true, rules });
        return false; // Sync response
    }

    /**
     * Handle TOGGLE_RULE action
     * @param message Message with rule ID and enabled status
     * @param sendResponse Function to send response
     * @returns True for async response
     */
    private handleToggleRule(
        message: MessageMap[typeof ACTIONS.TOGGLE_RULE]['message'],
        sendResponse: (response?: unknown) => void,
    ): boolean {
        (async () => {
            const toggled = await this.rules.toggleRule(
                message.ruleId,
                message.enabled,
            );
            sendResponse({ success: toggled });
        })();
        return true; // Async response
    }

    /**
     * Handle VALIDATE_RULE action
     * @param message Message with rule string to validate
     * @param sendResponse Function to send response
     * @returns False for sync response
     */
    private handleValidateRule(
        message: MessageMap[typeof ACTIONS.VALIDATE_RULE]['message'],
        sendResponse: (response?: unknown) => void,
    ): boolean {
        const ruleStr = message.ruleString;
        const isValid = RuleService.validateRuleFormat(ruleStr);
        sendResponse({ success: true, valid: isValid });
        return false; // Sync response
    }

    /**
     * Handle GET_THRESHOLDS action
     * @param sendResponse Function to send response
     * @returns True for async response
     */
    private handleGetThresholds(
        sendResponse: (response?: unknown) => void,
    ): boolean {
        (async () => {
            const thresholds = await SettingsManager.get([
                SETTINGS_KEYS.EMBEDDING_THRESHOLD,
                SETTINGS_KEYS.PROMPT_THRESHOLD,
                SETTINGS_KEYS.VISION_THRESHOLD,
            ]);

            sendResponse({
                success: true,
                embeddingThreshold: thresholds.embeddingThreshold,
                promptThreshold: thresholds.promptThreshold,
                visionThreshold: thresholds.visionThreshold,
            });
        })();
        return true; // Async response
    }

    /**
     * Handle SET_EMBEDDING_THRESHOLD action
     * @param message Message with new threshold value
     * @param sendResponse Function to send response
     * @returns True for async response
     */
    private handleSetEmbeddingThreshold(
        message: MessageMap[typeof ACTIONS.SET_EMBEDDING_THRESHOLD]['message'],
        sendResponse: (response?: unknown) => void,
    ): boolean {
        (async () => {
            const { threshold } = message;
            await SettingsManager.set(
                SETTINGS_KEYS.EMBEDDING_THRESHOLD,
                threshold,
            );
            this.llm.embeddingThreshold = threshold;
            logger.info(`Embedding threshold set to ${threshold}`);
            sendResponse({ success: true });
        })();
        return true; // Async response
    }

    /**
     * Handle SET_PROMPT_THRESHOLD action
     * @param message Message with new threshold value
     * @param sendResponse Function to send response
     * @returns True for async response
     */
    private handleSetPromptThreshold(
        message: MessageMap[typeof ACTIONS.SET_PROMPT_THRESHOLD]['message'],
        sendResponse: (response?: unknown) => void,
    ): boolean {
        (async () => {
            const { threshold } = message;
            await SettingsManager.set(
                SETTINGS_KEYS.PROMPT_THRESHOLD,
                threshold,
            );
            this.llm.promptThreshold = threshold;
            logger.info(`Prompt threshold set to ${threshold}`);
            sendResponse({ success: true });
        })();
        return true; // Async response
    }

    /**
     * Handle SET_VISION_THRESHOLD action
     * @param message Message with new threshold value
     * @param sendResponse Function to send response
     * @returns True for async response
     */
    private handleSetVisionThreshold(
        message: MessageMap[typeof ACTIONS.SET_VISION_THRESHOLD]['message'],
        sendResponse: (response?: unknown) => void,
    ): boolean {
        (async () => {
            const { threshold } = message;
            await SettingsManager.set(
                SETTINGS_KEYS.VISION_THRESHOLD,
                threshold,
            );
            this.llm.visionThreshold = threshold;
            logger.info(`Vision threshold set to ${threshold}`);
            sendResponse({ success: true });
        })();
        return true; // Async response
    }

    /**
     * Handle CAPTURE_PAGE_SCREENSHOT action
     * @param message Message with screenshot parameters
     * @param sendResponse Function to send response
     * @returns True for async response
     */
    private handleCapturePageScreenshot(
        message: MessageMap[typeof ACTIONS.CAPTURE_PAGE_SCREENSHOT]['message'],
        sendResponse: (response?: unknown) => void,
    ): boolean {
        (async () => {
            try {
                const tab = await chrome.tabs.query({
                    active: true,
                    currentWindow: true,
                });
                if (!tab[0] || tab[0].id === undefined) {
                    sendResponse({
                        success: false,
                        error: 'No active tab found',
                    });
                    return;
                }

                const result = await ScreenshotService.captureAndSave(
                    tab[0].id,
                    (message.bounds as CropBounds) || null,
                    message.criteria || '',
                );

                // Perform vision analysis if criteria provided
                const hasVisionData = result.success
                    && result.criteria
                    && result.dataUrl;
                if (hasVisionData) {
                    try {
                        const cacheInfo = (message.cacheInfo as Record<
                        string,
                        unknown
                        >) || {};
                        const pageUrl = cacheInfo.pageUrl
                            || 'unknown';
                        const selector = cacheInfo.selector
                            || 'unknown';
                        const index = cacheInfo.index || 0;
                        const cacheId = `${pageUrl}:`
                            + `${selector}:${index}`;
                        const startMsg = `📸 [${result.filename}] `
                            + 'Starting vision analysis for element: '
                            + `${cacheId}, criteria: `
                            + `'${result.criteria}'`;
                        logger.info(startMsg);
                        const sizeKb = (result.dataUrl.length / 1024)
                            .toFixed(2);
                        const sizeMsg = `📸 [${result.filename}] `
                            + `Image data size: ${sizeKb} KB`;
                        logger.info(sizeMsg);
                        // Extract base64 from data URL
                        const base64Parts = result.dataUrl.split(',');
                        const base64Data = base64Parts[1] || '';
                        const criteria = result.criteria || '';
                        const parsed = await this.llm
                            .analyzeByImage(
                                base64Data,
                                criteria,
                                cacheInfo,
                            );
                        const completeMsg = `📸 [${result.filename}] `
                            + 'Vision analysis complete - Full result:';
                        logger.info(completeMsg);
                        logger.info(
                            `📸 [${result.filename}] - Matches: `
                            + `${parsed.matches}`,
                        );
                        const confPct = (parsed.confidence * 100)
                            .toFixed(1);
                        const confMsg = `📸 [${result.filename}] `
                            + `- Confidence: ${confPct}%`;
                        logger.info(confMsg);
                        const thrPct = (this.llm.visionThreshold
                            * 100).toFixed(1);
                        const thrMsg = `📸 [${result.filename}] `
                            + `- Threshold: ${thrPct}%`;
                        logger.info(thrMsg);
                        logger.info(
                            `📸 [${result.filename}] - Explanation: `
                            + `${parsed.explanation}`,
                        );
                        logger.info(
                            `📸 [${result.filename}] - Provider: `
                            + `${parsed.provider}`,
                        );
                        logger.info(
                            `📸 [${result.filename}] - Cached: `
                            + `${parsed.cached}`,
                        );

                        // Add analysis to result with threshold
                        result.visionAnalysis = {
                            ...parsed,
                            threshold: this.llm.visionThreshold,
                        };
                    } catch (error) {
                        const logMsg = `📸 [${result.filename}] `
                            + 'Vision analysis failed:';
                        logger.error(logMsg, error);
                        const errMsg = 'Analysis error: '
                            + `${getErrorMessage(error)}`;
                        result.visionAnalysis = {
                            matches: false,
                            confidence: 0,
                            threshold: this.llm.visionThreshold,
                            explanation: errMsg,
                        };
                    }
                }

                sendResponse(result);
            } catch (error) {
                logger.error('Error capturing screenshot:', error);
                sendResponse({
                    success: false,
                    error: getErrorMessage(error),
                });
            }
        })();
        return true; // Async response
    }

    /**
     * Handle CAPTURE_PAGE_SCREENSHOT action via port
     * @param message Message with screenshot parameters
     * @param port Port to send response through
     * @param tabId Tab ID to capture screenshot from
     */
    async handleCapturePageScreenshotViaPort(
        message: MessageMap[typeof ACTIONS.CAPTURE_PAGE_SCREENSHOT]['message'],
        port: chrome.runtime.Port,
        tabId: number,
    ): Promise<void> {
        try {
            const result = await ScreenshotService.captureAndSave(
                tabId,
                (message.bounds as CropBounds) || null,
                message.criteria || '',
                (filename: string) => {
                    // Notify content script that screenshot is captured
                    // This allows blur to be applied immediately
                    port.postMessage({
                        action: ACTIONS.SCREENSHOT_CAPTURED,
                        filename,
                    });
                },
            );

            // Perform vision analysis if criteria provided
            const hasVisionData = result.success
                && result.criteria
                && result.dataUrl;
            if (hasVisionData) {
                try {
                    const cacheInfo = (message.cacheInfo as Record<
                    string,
                    unknown
                    >) || {};
                    const pageUrl = cacheInfo.pageUrl
                        || 'unknown';
                    const selector = cacheInfo.selector
                        || 'unknown';
                    const index = cacheInfo.index || 0;
                    const cacheId = `${pageUrl}:`
                        + `${selector}:${index}`;
                    const startMsg = `📸 [${result.filename}] `
                        + 'Starting vision analysis for element: '
                        + `${cacheId}, criteria: `
                        + `'${result.criteria}'`;
                    logger.info(startMsg);
                    const sizeKb = (result.dataUrl.length / 1024)
                        .toFixed(2);
                    const sizeMsg = `📸 [${result.filename}] `
                        + `Image data size: ${sizeKb} KB`;
                    logger.info(sizeMsg);
                    // Extract base64 from data URL
                    const base64Parts = result.dataUrl.split(',');
                    const base64Data = base64Parts[1] || '';
                    const criteria = result.criteria || '';
                    const parsed = await this.llm
                        .analyzeByImage(
                            base64Data,
                            criteria,
                            cacheInfo,
                        );
                    const completeMsg = `📸 [${result.filename}] `
                        + 'Vision analysis complete - Full result:';
                    logger.info(completeMsg);
                    logger.info(
                        `📸 [${result.filename}] - Matches: `
                        + `${parsed.matches}`,
                    );
                    const confPct = (parsed.confidence * 100)
                        .toFixed(1);
                    const confMsg = `📸 [${result.filename}] `
                        + `- Confidence: ${confPct}%`;
                    logger.info(confMsg);
                    const thrPct = (this.llm.visionThreshold
                        * 100).toFixed(1);
                    const thrMsg = `📸 [${result.filename}] `
                        + `- Threshold: ${thrPct}%`;
                    logger.info(thrMsg);
                    logger.info(
                        `📸 [${result.filename}] - Explanation: `
                        + `${parsed.explanation}`,
                    );
                    logger.info(
                        `📸 [${result.filename}] - Provider: `
                        + `${parsed.provider}`,
                    );
                    logger.info(
                        `📸 [${result.filename}] - Cached: `
                        + `${parsed.cached}`,
                    );

                    // Add analysis to result with threshold
                    result.visionAnalysis = {
                        ...parsed,
                        threshold: this.llm.visionThreshold,
                    };
                } catch (error) {
                    const logMsg = `📸 [${result.filename}] `
                        + 'Vision analysis failed:';
                    logger.error(logMsg, error);
                    const errMsg = 'Analysis error: '
                        + `${getErrorMessage(error)}`;
                    result.visionAnalysis = {
                        matches: false,
                        confidence: 0,
                        threshold: this.llm.visionThreshold,
                        explanation: errMsg,
                    };
                }
            }

            port.postMessage(result);
        } catch (error) {
            logger.error('Error capturing screenshot:', error);
            port.postMessage({
                success: false,
                error: getErrorMessage(error),
            });
        }
    }

    /**
     * Handle DOWNLOAD_CANVAS_IMAGE action
     * @param message Message with data URL
     * @param sendResponse Function to send response
     * @returns True for async response
     */
    private handleDownloadCanvasImage(
        message: MessageMap[typeof ACTIONS.DOWNLOAD_CANVAS_IMAGE]['message'],
        sendResponse: (response?: unknown) => void,
    ): boolean {
        (async () => {
            try {
                const res = await ScreenshotService.downloadFromDataUrl(
                    message.dataUrl,
                );
                sendResponse(res);
            } catch (error) {
                logger.error('Error downloading canvas image:', error);
                sendResponse({
                    success: false,
                    error: getErrorMessage(error),
                });
            }
        })();
        return true; // Async response
    }

    /**
     * Handle ANALYZE_ELEMENTS action
     * @param message Message with elements to analyze
     * @param sendResponse Function to send response
     * @returns True for async response
     */
    private handleAnalyzeElements(
        message: MessageMap[typeof ACTIONS.ANALYZE_ELEMENTS]['message'],
        sendResponse: (response?: unknown) => void,
    ): boolean {
        (async () => {
            try {
                const rules = await SettingsManager.get(
                    SETTINGS_KEYS.AD_BLOCK_RULES,
                );

                // Parse rules using RuleService
                const parsedRules = rules.map((storedRule) => {
                    try {
                        return RuleService.parseRule(
                            storedRule.ruleString,
                        );
                    } catch (error) {
                        logger.error(
                            `Failed to parse: ${storedRule.ruleString}`,
                        );
                        return null;
                    }
                }).filter((rule): rule is Rule => rule !== null);

                // Analyze elements with rules from settings
                const results = await this.analyzeElementsBatch(
                    message.elements,
                    parsedRules,
                );
                sendResponse({ success: true, results });
                MessageHandler.notifyPopupAnalysisComplete(results);
            } catch (error) {
                logger.error('Error analyzing elements:', error);
                sendResponse({
                    success: false,
                    error: getErrorMessage(error),
                });
            }
        })();
        return true; // Async response
    }

    /**
     * Notify popup about analysis completion
     * @param results Analysis results
     */
    static notifyPopupAnalysisComplete(
        results: ElementRuleMatchResult[],
    ): void {
        try {
            chrome.runtime.sendMessage({
                action: ACTIONS.ANALYSIS_COMPLETE,
                results,
            });
        } catch (error) {
            // Ignore errors - popup might not be open
            const msg = `Failed to notify popup (popup likely closed): ${
                (error as Error).message}`;
            logger.debug(msg);
        }
    }
}
