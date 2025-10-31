// Background script manager - Coordinates services and handles messages

import {
    ACTIONS,
    PORT_NAMES,
    RULE_TYPE,
    SETTINGS_KEYS,
} from '../shared/constants';
import { createLogger } from '../shared/logger';
import type { Rule } from '../shared/rule-types';
import { SettingsManager } from '../shared/settings';

import { LLMService } from './llm-service';
import {
    MessageHandler,
    type ActionMessage,
    type AnalyzableElement,
    type ElementRuleMatchResult,
} from './message-handler';
import { RuleService } from './rule-service';

const logger = createLogger('Background');

/**
 * BackgroundManager class handles all background operations
 */
export class BackgroundManager {
    llmService: LLMService;

    ruleService: RuleService;

    messageHandler: MessageHandler;

    constructor() {
        this.llmService = new LLMService();
        this.ruleService = new RuleService();
        // Initialize message handler with services
        this.messageHandler = new MessageHandler(
            this.llmService,
            this.ruleService,
            this.analyzeElementsBatch.bind(this),
        );
    }

    /**
     * Initialize all services
     */
    async init() {
        await this.llmService.init();
        await this.ruleService.initialize();

        // Set up message listener
        chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));

        // Set up port listener for streaming analysis
        chrome.runtime.onConnect.addListener(
            this.handlePortConnection.bind(this),
        );

        // Handle extension shutdown
        chrome.runtime.onSuspend.addListener(() => {
            logger.info('Extension suspending, saving cache...');
            if (this.llmService) {
                this.llmService.forceSave();
            }
        });

        logger.info('Services initialized successfully');
    }

    /**
     * Batch analyze elements against rules
     * @param elements Array of element objects with id, text, selector
     * @param rules Array of rule objects
     * @returns Array of analysis results
     */
    async analyzeElementsBatch(
        elements: AnalyzableElement[],
        rules: Rule[],
    ): Promise<ElementRuleMatchResult[]> {
        const results = [];

        for (const rule of rules) {
            if (!rule.enabled) {
                logger.info(`Skipping disabled rule: ${rule.ruleString}`);
                continue;
            }

            // TODO we should be able to analyze them by several at once
            for (const element of elements) {
                try {
                    let shouldBlock = false;
                    let confidence = 0;

                    // Check against rule criteria
                    if (rule.type === RULE_TYPE.EMBEDDING) {
                        const result = await this.llmService.analyzeByEmbedding(
                            element.text,
                            rule.containsText,
                            element.groundTruth,
                        );
                        shouldBlock = result.matches;
                        confidence = result.confidence;
                    } else if (rule.type === RULE_TYPE.PROMPT) {
                        const result = await this.llmService.analyzeByPrompt(
                            element.text,
                            rule.prompt,
                            element.groundTruth,
                        );
                        shouldBlock = result.matches;
                        confidence = result.confidence;
                    }

                    if (shouldBlock) {
                        results.push({
                            elementId: element.id,
                            ruleId: rule.id,
                            confidence,
                            rule,
                            element,
                        });
                        const text = element.text.substring(0, 50);
                        const msg = `Element "${text}..."`
                            + ` matches rule "${rule.ruleString}"`
                            + ` (confidence: ${confidence})`;
                        logger.info(msg);
                    }
                } catch (error) {
                    const msg = 'Error analyzing element'
                        + ` "${element.text.substring(0, 50)}..."`
                        + ` with rule "${rule.ruleString}":`;
                    logger.error(msg, error);
                }
            }
        }

        return results;
    }

    /**
     * Handle messages from content scripts - delegates to MessageHandler
     * @param message Message from content script
     * @param sender Message sender information
     * @param sendResponse Function to send response back
     * @returns True if response will be sent asynchronously
     */
    handleMessage(
        message: ActionMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void,
    ): boolean {
        return this.messageHandler.handle(message, sender, sendResponse);
    }

    /**
     * Analyze a single element with a single rule
     * @param element Element with id, text, selector
     * @param rule Rule object
     * @returns Analysis result with matches and confidence
     */
    async analyzeElementWithRule(
        element: AnalyzableElement,
        rule: Rule,
    ): Promise<{ matches: boolean; confidence: number; threshold?: number }> {
        try {
            let matches = false;
            let confidence = 0;
            let threshold;

            // Check against rule criteria
            if (rule.type === RULE_TYPE.EMBEDDING) {
                // Use embedding threshold from LLM service
                threshold = this.llmService.embeddingThreshold;

                const checkResult = await this.llmService.analyzeByEmbedding(
                    element.text,
                    rule.containsText,
                    element.groundTruth,
                );
                matches = checkResult.matches;
                confidence = checkResult.confidence;
            } else if (rule.type === RULE_TYPE.PROMPT) {
                // Use prompt threshold from LLM service
                threshold = this.llmService.promptThreshold;

                const result = await this.llmService.analyzeByPrompt(
                    element.text,
                    rule.prompt,
                    element.groundTruth,
                );
                matches = result.matches;
                confidence = result.confidence;
            }

            return { matches, confidence, threshold };
        } catch (error) {
            const msg = 'Error analyzing element'
                + ` ${element.id} with rule ${rule.ruleString}:`;
            logger.error(msg, error);
            return { matches: false, confidence: 0 };
        }
    }

    /**
     * Handle port connections for streaming analysis and screenshot capture
     * @param {chrome.runtime.Port} port Port connection
     */
    handlePortConnection(port: chrome.runtime.Port): void {
        if (port.name === PORT_NAMES.STREAMING_ANALYSIS) {
            logger.info('Streaming analysis port connected');

            port.onMessage.addListener((message: ActionMessage) => {
                this.handleStreamingMessage(message, port);
            });

            port.onDisconnect.addListener(() => {
                logger.info('Streaming analysis port disconnected');
            });
        } else if (port.name === PORT_NAMES.SCREENSHOT_CAPTURE) {
            logger.info('Screenshot capture port connected');

            port.onMessage.addListener((message: ActionMessage) => {
                this.handleScreenshotCaptureMessage(message, port);
            });

            port.onDisconnect.addListener(() => {
                logger.info('Screenshot capture port disconnected');
            });
        }
    }

    /**
     * Handle screenshot capture message via port
     * @param message Message from port
     * @param port Port connection
     */
    async handleScreenshotCaptureMessage(
        message: ActionMessage,
        port: chrome.runtime.Port,
    ): Promise<void> {
        if (message.action !== ACTIONS.CAPTURE_PAGE_SCREENSHOT) {
            return;
        }

        try {
            // Get sender tab ID from port
            const tabId = port.sender?.tab?.id;
            if (!tabId) {
                port.postMessage({
                    success: false,
                    error: 'No tab ID in port sender',
                });
                return;
            }

            // Delegate to message handler with port
            await this.messageHandler.handleCapturePageScreenshotViaPort(
                message,
                port,
                tabId,
            );
        } catch (error) {
            logger.error('Screenshot capture error:', error);
            if (BackgroundManager.isPortConnected(port)) {
                try {
                    port.postMessage({
                        success: false,
                        error: (error as Error).message,
                    });
                } catch (portError) {
                    logger.debug('Port disconnected while sending error');
                }
            }
        }
    }

    /**
     * Handle streaming analysis message
     * @param message Message from port
     * @param port Port connection
     */
    async handleStreamingMessage(
        message: ActionMessage,
        port: chrome.runtime.Port,
    ): Promise<void> {
        if (message.action !== ACTIONS.ANALYZE_ELEMENTS) {
            return;
        }

        try {
            await this.processStreamingAnalysis(message.elements, port);
        } catch (error) {
            logger.error('Streaming analysis error:', error);
            // Only try to send error if port is still connected
            if (BackgroundManager.isPortConnected(port)) {
                try {
                    port.postMessage({
                        type: 'error',
                        error: (error as Error).message,
                    });
                } catch (portError) {
                    const msg = 'Port disconnected '
                        + 'while sending error message';
                    logger.debug(msg);
                }
            }
        }
    }

    /**
     * Process streaming analysis for elements
     * @param elements Elements to analyze
     * @param port Port for sending results
     */
    async processStreamingAnalysis(
        elements: AnalyzableElement[],
        port: chrome.runtime.Port,
    ): Promise<void> {
        const count = elements.length;
        logger.info(`Starting streaming analysis for ${count} elements`);

        // Pre-analysis checks at background level
        const blockingEnabled = await SettingsManager.get(
            SETTINGS_KEYS.BLOCKING_ENABLED,
        );
        if (!blockingEnabled) {
            const msg = '⚠️ Blocking is disabled, skipping';
            logger.info(msg);
            if (BackgroundManager.isPortConnected(port)) {
                port.postMessage({
                    type: 'complete',
                });
            }
            return;
        }

        const enabledRules = this.getEnabledRules();
        if (enabledRules.length === 0) {
            const msg = 'No executable rules '
                + '(rules may require API key that is not configured)';
            logger.info(msg);
            if (BackgroundManager.isPortConnected(port)) {
                port.postMessage({
                    type: 'complete',
                });
            }
            return;
        }

        for (const element of elements) {
            // Check if port is still connected before processing next element
            if (!BackgroundManager.isPortConnected(port)) {
                const msg = 'Port disconnected '
                    + 'during streaming analysis, stopping';
                logger.debug(msg);
                return;
            }
            await this.analyzeAndSendResult(element, enabledRules, port);
        }

        // Only send complete message if port is still connected
        if (BackgroundManager.isPortConnected(port)) {
            try {
                port.postMessage({ type: 'complete' });
                logger.info('Streaming analysis complete');
            } catch (error) {
                const msg = 'Port disconnected '
                    + 'while sending complete message';
                logger.debug(msg);
            }
        } else {
            logger.debug('Port disconnected, skipping complete message');
        }
    }

    /**
     * Get enabled rules from rule service, filtered by API key availability
     * @returns {Array} Array of enabled rules that can be executed
     */
    getEnabledRules(): Rule[] {
        const rules = this.ruleService.getRules();
        return rules.filter((r: Rule) => {
            if (!r.enabled) {
                return false;
            }

            // Check if this rule type can be executed
            // (filters out rules requiring API key when no API
            // key is configured)
            const canExecute = this.llmService.canExecuteRuleType(r.type);
            if (!canExecute) {
                const msg = `Skipping rule "${r.ruleString}" `
                    + `(type: ${r.type}) - requires API key`;
                logger.info(msg);
            }

            return canExecute;
        });
    }

    /**
     * Analyze element and send result via port
     * @param {object} element Element to analyze
     * @param {Array} enabledRules Array of enabled rules
     * @param {chrome.runtime.Port} port Port for sending result
     */
    async analyzeAndSendResult(
        element: AnalyzableElement,
        enabledRules: Rule[],
        port: chrome.runtime.Port,
    ): Promise<void> {
        try {
            const result = await this.findBestRuleMatch(element, enabledRules);
            BackgroundManager.sendElementResult(port, element.id, result);

            const status = result.matched ? 'blocked' : 'allowed';
            logger.info(`Sent result for element ${element.id}: ${status}`);
        } catch (error) {
            logger.error(`Error analyzing element ${element.id}:`, error);
            // Only try to send error result if port is still connected
            if (BackgroundManager.isPortConnected(port)) {
                BackgroundManager.sendElementResult(port, element.id, {
                    matched: false,
                    matchedRule: null,
                    maxConfidence: 0,
                    threshold: 0,
                });
            }
        }
    }

    /**
     * Find best matching rule for element
     * @param element Element to analyze
     * @param enabledRules Array of enabled rules
     * @returns Result with matched, matchedRule, maxConfidence
     */
    async findBestRuleMatch(
        element: AnalyzableElement,
        enabledRules: Rule[],
    ): Promise<{
            matched: boolean;
            matchedRule: Rule | null;
            maxConfidence: number;
            threshold: number;
        }> {
        let matched = false;
        let matchedRule = null;
        let maxConfidence = 0;
        let threshold = 0;

        // Filter rules to only those whose selector matches this element
        const applicableRules = enabledRules.filter(
            (rule: Rule) => rule.selector === element.selector,
        );

        if (applicableRules.length === 0) {
            logger.debug(
                'No applicable rules for element with selector: '
                + `${element.selector}`,
            );
            return {
                matched, matchedRule, maxConfidence, threshold,
            };
        }

        for (const rule of applicableRules) {
            const result = await this.analyzeElementWithRule(element, rule);

            if (result.matches && result.confidence > maxConfidence) {
                matched = true;
                matchedRule = rule;
                maxConfidence = result.confidence;
                threshold = result.threshold ?? 0;
            }
        }

        return {
            matched,
            matchedRule,
            maxConfidence,
            threshold,
        };
    }

    /**
     * Check if a port is still connected
     * @param {chrome.runtime.Port} port Port to check
     * @returns {boolean} True if port is connected, false otherwise
     */
    static isPortConnected(port: chrome.runtime.Port): boolean {
        // Chrome ports have an internal disconnected flag
        // we can't access directly but we can check the sender property.
        // Disconnected ports lose their sender.
        // We'll also rely on try-catch in the calling code as a fallback.
        return port && port.sender !== null && port.sender !== undefined;
    }

    /**
     * Send element analysis result via port
     * @param port Port connection
     * @param elementId Element ID
     * @param result Analysis result
     * @param result.matched Whether element matched a rule
     * @param result.matchedRule The matched rule or null
     * @param result.maxConfidence Maximum confidence score
     * @param result.threshold Threshold used for matching
     */
    static sendElementResult(
        port: chrome.runtime.Port,
        elementId: string,
        result: {
            matched: boolean;
            matchedRule: Rule | null;
            maxConfidence: number;
            threshold: number;
        },
    ): void {
        try {
            // Check if port is still connected before attempting to send
            if (!BackgroundManager.isPortConnected(port)) {
                const msg = 'Port disconnected, '
                    + `skipping result for element ${elementId}`;
                logger.debug(msg);
                return;
            }

            const message = {
                type: 'result',
                data: {
                    elementId,
                    matches: result.matched,
                    rule: result.matchedRule,
                    confidence: result.maxConfidence,
                    threshold: result.threshold,
                },
            };

            port.postMessage(message);
        } catch (error) {
            // Handle disconnected port errors gracefully
            if ((error as Error).message && (error as Error).message.includes('disconnected port')) {
                const msg = 'Port disconnected while sending result '
                    + `for element ${elementId}`;
                logger.debug(msg);
            } else {
                // Re-throw if it's a different error
                throw error;
            }
        }
    }
}
