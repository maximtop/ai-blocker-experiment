// Content Analyzer - Main analysis orchestration using new modular architecture

import {
    ACTIONS,
    GROUND_TRUTH,
    GroundTruthLabel,
    PORT_NAMES,
} from '../shared/constants';
import { createLogger } from '../shared/logger';
import type { Rule } from '../shared/rule-types';
import { BLUR_MODE } from './content-constants';
import { ContentObserver } from './content-observer';
import { ExtensionContextManager } from './extension-context-manager';
import { RuleDOMManager } from './rule-dom-manager';

const logger = createLogger('ContentAnalyzer');

/**
 * Candidate element for analysis
 */
interface CandidateElement {
    id: string;
    element: Element;
    text: string;
    selector: string;
    ruleString: string;
}

/**
 * Element data sent to background for analysis
 */
interface ElementData {
    id: string;
    text: string;
    selector: string;
    groundTruth?: GroundTruthLabel;
}

/**
 * Analysis result from background
 */
interface AnalysisResult {
    elementId: string;
    matches: boolean;
    confidence: number;
    threshold: number;
    similarity?: number;
    rule: Rule;
}

/**
 * Rule statistics
 */
interface RuleStats {
    rule: Rule;
    candidates: number;
    blocked: number;
    skipped: number;
}

/**
 * Analysis results summary
 */
interface AnalysisResults {
    totalRules: number;
    appliedRules: number;
    foundElements: number;
    skippedElements: number;
    blockedElements: number;
    ruleResults: RuleStats[];
}

/**
 * Streaming message from port
 */
interface StreamingMessage {
    type: string;
    data?: AnalysisResult;
    error?: string;
}

export class ContentAnalyzer {
    /**
     * DOM manager instance
     */
    private ruleDOMManager: RuleDOMManager | null;

    /**
     * Flag indicating if analysis is in progress
     */
    private isAnalyzing: boolean;

    /**
     * Flag indicating if analyzer is initialized
     */
    private initialized: boolean;

    /**
     * Cached rules from background
     */
    private rules: Rule[];

    constructor() {
        this.ruleDOMManager = null;
        this.isAnalyzing = false;
        this.initialized = false;
        this.rules = [];
    }

    /**
     * Initialize the analyzer with pre-fetched rules
     * @param rules Array of rules from background
     */
    async initialize(rules: Rule[] = []): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            this.rules = rules;
            this.ruleDOMManager = new RuleDOMManager();
            ContentObserver.initialize(() => {
                this.analyzePageWithRules();
            });
            this.setupMessageHandlers();
            this.setupPageLifecycleHandlers();

            this.initialized = true;
            logger.info(
                `Content analyzer initialized with ${rules.length} rules`,
            );

            // Start auto-analysis immediately if we have rules
            // Prerequisites already validated by ContentManager
            if (rules.length > 0) {
                this.analyzePageWithRules();
            }
        } catch (error) {
            logger.error('Failed to initialize:', error);
        }
    }

    /**
     * Main analysis function
     */
    async analyzePageWithRules(): Promise<void> {
        if (this.isAnalyzing) {
            logger.info('Analysis already in progress...');
            return;
        }

        // Check extension context before starting
        if (!ExtensionContextManager.isValid()) {
            logger.error('Extension context invalid, aborting analysis');
            ExtensionContextManager.handleInvalidated(() => this.cleanup());
            return;
        }

        // Clean up any existing blurs from previous incomplete runs
        if (this.ruleDOMManager) {
            this.ruleDOMManager.cleanupAllBlurs();
        }

        this.isAnalyzing = true;

        try {
            logger.info('Starting page analysis...');

            // Apply rules using batch analysis architecture
            // Note: We don't unblock previous results to support incremental analysis
            // Already blocked elements remain blocked, only new elements are analyzed
            // Rules are managed on background page
            const results = await this.applyRulesWithBatchAnalysis();

            // Log results
            ContentAnalyzer.logAnalysisResults(results);
        } catch (error) {
            const isInvalidated = ExtensionContextManager
                .isContextInvalidatedError(error as Error);
            if (isInvalidated) {
                logger.error('Extension invalidated during analysis');
                ExtensionContextManager.handleInvalidated(() => this.cleanup());
                return;
            }
            logger.error('Analysis error:', error);
        } finally {
            // Only reset analyzing flag if extension context is still valid
            if (ExtensionContextManager.isValid()) {
                this.isAnalyzing = false;
            }
        }
    }

    /**
     * Apply rules using batch analysis in background script
     * Rules are managed on background page, we only send element data
     * @returns Analysis results
     */
    async applyRulesWithBatchAnalysis(): Promise<AnalysisResults> {
        const results: AnalysisResults = {
            totalRules: 0,
            appliedRules: 0,
            foundElements: 0,
            skippedElements: 0,
            blockedElements: 0,
            ruleResults: [],
        };

        // Use pre-fetched rules from initialization
        const { rules } = this;
        results.totalRules = rules.length;

        if (rules.length === 0 || !this.ruleDOMManager) {
            logger.info('No rules to apply');
            return results;
        }

        // Count enabled rules
        const enabledRules = rules.filter((rule) => rule.enabled);
        results.appliedRules = enabledRules.length;

        // Step 2: Collect all candidate elements
        const allCandidates = new Map<string, CandidateElement>();
        const ruleStatsMap = new Map<string, RuleStats>();

        for (const rule of rules) {
            if (!rule.enabled) {
                continue;
            }

            const candidateElements = RuleDOMManager
                .findElementsByRule(rule);

            // Track stats per rule
            ruleStatsMap.set(rule.ruleString, {
                rule,
                candidates: candidateElements.length,
                blocked: 0,
                skipped: 0,
            });

            for (const candidate of candidateElements) {
                // Skip elements that were already analyzed
                if (this.ruleDOMManager.isElementAnalyzed(candidate.element)) {
                    continue;
                }

                const elementId = `${candidate.selector}-`
                    + `${candidate.text.substring(0, 50)}`;

                if (!allCandidates.has(elementId)) {
                    allCandidates.set(elementId, {
                        id: elementId,
                        element: candidate.element,
                        text: candidate.text,
                        selector: candidate.selector,
                        ruleString: rule.ruleString,
                    });
                }
            }
        }

        const candidateArray = Array.from(allCandidates.values());
        results.foundElements = candidateArray.length;

        logger.info(`Analyzing ${candidateArray.length} elements`);

        if (candidateArray.length === 0) {
            return results;
        }

        // Step 3: Start analysis blur for all candidates
        type CleanupFn = (() => void) | null;
        const blurCleanups = new Map<string, CleanupFn>();
        for (const candidate of candidateArray) {
            const cleanup = this.ruleDOMManager.applyAnalysisBlur(
                candidate.element,
                BLUR_MODE.ANALYZING,
            );
            blurCleanups.set(candidate.id, cleanup);
            logger.debug(
                `Stored cleanup for element: ${candidate.id}, `
                + `cleanup type: ${typeof cleanup}`,
            );
        }
        logger.info(`Created ${blurCleanups.size} blur cleanups`);

        try {
            // Step 4: Send element data to background for streaming analysis
            // Background page has rules, no need to send them
            const elementsData: ElementData[] = candidateArray.map((c) => {
                // Extract ground truth from data attribute or debug marker
                let groundTruth: GroundTruthLabel | undefined;
                const gtAttr = c.element.getAttribute('data-ground-truth');
                if (
                    gtAttr === GROUND_TRUTH.AD
                    || gtAttr === GROUND_TRUTH.NOT_AD
                ) {
                    groundTruth = gtAttr as GroundTruthLabel;
                } else {
                    // Check for debug marker class
                    const marker = c.element.querySelector('.debug-marker');
                    if (marker) {
                        if (marker.classList.contains('should-block')) {
                            groundTruth = GROUND_TRUTH.AD;
                        } else if (marker.classList.contains('should-keep')) {
                            groundTruth = GROUND_TRUTH.NOT_AD;
                        }
                    }
                }

                return {
                    id: c.id,
                    text: c.text,
                    selector: c.selector,
                    groundTruth,
                };
            });

            logger.info(
                'Starting streaming analysis for '
                + `${elementsData.length} elements...`,
            );

            // Create a port for streaming results
            const port = chrome.runtime.connect({
                name: PORT_NAMES.STREAMING_ANALYSIS,
            });

            // Set up result handler
            const resultPromise = new Promise<void>((resolve, reject) => {
                let processedCount = 0;
                const totalElements = elementsData.length;

                port.onMessage.addListener((message: StreamingMessage) => {
                    if (message.type === 'result' && message.data) {
                        // Handle individual result as it arrives
                        const result = message.data;
                        processedCount += 1;

                        logger.info(
                            `Received result ${processedCount}/`
                            + `${totalElements} for element: `
                            + `${result.elementId}`,
                        );

                        const candidate = allCandidates.get(result.elementId);
                        if (candidate && this.ruleDOMManager !== null) {
                            // Log detailed confidence/similarity info
                            const text = candidate.text.substring(0, 80);
                            const textLines = candidate.text.split('\n');
                            const title = (textLines[0] || '').substring(0, 50);
                            if (result.similarity !== undefined) {
                                // Embedding rule - log similarity vs threshold
                                const simStr = result.similarity.toFixed(4);
                                const threshStr = result.threshold
                                    ? result.threshold.toFixed(4)
                                    : 'N/A';
                                const status = result.matches
                                    ? '✓ MATCH'
                                    : '✗ NO MATCH';
                                logger.debug(
                                    `📊 [${title}...] → `
                                    + `Similarity: ${simStr}, `
                                    + `Threshold: ${threshStr} → ${status}`,
                                );
                            } else {
                                // Prompt rule - log match result
                                const status = result.matches
                                    ? '✓ MATCH'
                                    : '✗ NO MATCH';
                                logger.debug(
                                    `📊 [${title}...] → ${status}`,
                                );
                            }

                            // Remove analysis blur immediately
                            const cleanup = blurCleanups.get(result.elementId);
                            logger.info(
                                'Retrieved cleanup for element: '
                                + `${result.elementId}, cleanup type: `
                                + `${typeof cleanup}, exists: ${!!cleanup}`,
                            );
                            if (cleanup) {
                                this.ruleDOMManager.removeAnalysisBlur(cleanup);
                                blurCleanups.delete(result.elementId);
                                logger.info(
                                    'Removed analysis blur for element: '
                                    + `${result.elementId}`,
                                );
                            } else {
                                logger.warn(
                                    'No cleanup found in map for '
                                    + `element: ${result.elementId}`,
                                );
                            }

                            // Mark element as analyzed (safe or blocked)
                            this.ruleDOMManager.markElementAsAnalyzed(
                                candidate.element,
                            );

                            // If element matches, apply permanent block
                            if (result.matches) {
                                this.ruleDOMManager.blockElement(
                                    candidate.element,
                                    result.rule,
                                    result.confidence,
                                    result.threshold,
                                );
                                results.blockedElements += 1;

                                // Update per-rule stats
                                const ruleStats = ruleStatsMap.get(
                                    result.rule.ruleString,
                                );
                                if (ruleStats !== undefined) {
                                    ruleStats.blocked += 1;
                                }

                                const rule = result.rule.ruleString;
                                const conf = result.confidence;
                                const msg = `Blocked element: "${text}..." `
                                    + `with rule "${rule}" `
                                    + `(confidence: ${conf})`;
                                logger.info(msg);
                            } else {
                                // Log safe elements (not blocked)
                                const scorePercent = result.confidence
                                    !== undefined
                                    ? (result.confidence * 100).toFixed(0)
                                    : 'N/A';
                                const threshPercent = result.threshold
                                    !== undefined
                                    ? (result.threshold * 100).toFixed(0)
                                    : 'N/A';
                                logger.info(
                                    `✓ Element ${result.elementId} is SAFE `
                                    + `(score: ${scorePercent}%, `
                                    + `threshold: ${threshPercent}%)`,
                                );
                            }
                        }
                    } else if (message.type === 'complete') {
                        // All elements processed
                        logger.info('Streaming analysis complete');
                        port.disconnect();
                        resolve();
                    } else if (message.type === 'error') {
                        port.disconnect();
                        reject(new Error(message.error));
                    }
                });

                port.onDisconnect.addListener(() => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    }
                });

                // Send analysis request
                port.postMessage({
                    action: ACTIONS.ANALYZE_ELEMENTS,
                    elements: elementsData,
                });
            });

            // Wait for all results to be processed
            await resultPromise;

            // Clean up any remaining analysis blurs (shouldn't be any)
            if (blurCleanups.size > 0) {
                logger.warn(
                    `${blurCleanups.size} blurs still active `
                    + 'after analysis',
                );
                for (const cleanup of blurCleanups.values()) {
                    if (cleanup) {
                        this.ruleDOMManager.removeAnalysisBlur(cleanup);
                    }
                }
            }

            // Populate rule results
            results.ruleResults = Array.from(ruleStatsMap.values());

            logger.info(
                `Batch analysis complete: ${results.blockedElements}/`
                + `${results.foundElements} elements blocked`,
            );
        } catch (error) {
            // Clean up all analysis blurs on error
            for (const cleanup of blurCleanups.values()) {
                if (cleanup) {
                    this.ruleDOMManager.removeAnalysisBlur(cleanup);
                }
            }
            throw error;
        }

        return results;
    }

    /**
     * Log detailed analysis results
     * @param results Analysis results object
     */
    static logAnalysisResults(results: AnalysisResults): void {
        logger.info('=== Analysis Results ===');
        logger.info(`Total rules: ${results.totalRules}`);
        logger.info(`Applied rules: ${results.appliedRules}`);
        logger.info(`Found elements: ${results.foundElements}`);
        logger.info(`Skipped elements: ${results.skippedElements}`);
        logger.info(`Blocked elements: ${results.blockedElements}`);

        logger.info('Details by rule:');
        results.ruleResults.forEach((ruleResult) => {
            const { skipped } = ruleResult;
            const skippedText = skipped ? `, ${skipped} skipped` : '';
            logger.info(
                `  "${ruleResult.rule.ruleString}": `
                + `${ruleResult.candidates} found${skippedText}, `
                + `${ruleResult.blocked} blocked`,
            );
        });
        logger.info('============================');
    }

    /**
     * Get blocked elements statistics
     * @returns Blocked elements statistics
     */
    getBlockedStats(): { total: number; byRule: Record<string, number> } {
        if (this.ruleDOMManager) {
            return this.ruleDOMManager.getBlockedStats();
        }
        return { total: 0, byRule: {} };
    }

    /**
     * Unblock all elements
     */
    unblockAll(): void {
        if (this.ruleDOMManager) {
            this.ruleDOMManager.unblockAll();
        }
    }

    /**
     * Setup message handlers
     */
    setupMessageHandlers(): void {
        const listener = (
            message: { action: string },
            _sender: chrome.runtime.MessageSender,
            sendResponse: (response: unknown) => void,
        ) => {
            // Check extension context before processing messages
            if (!ExtensionContextManager.isValid()) {
                logger.error('Extension context invalid, ignoring message');
                const error = 'Extension context invalidated';
                sendResponse({ success: false, error });
                return false;
            }

            switch (message.action) {
                case ACTIONS.UNBLOCK_ALL:
                    this.unblockAll();
                    sendResponse({ success: true });
                    return false; // Sync response

                case ACTIONS.START_ANALYSIS:
                    // Background requests analysis to start
                    this.analyzePageWithRules();
                    sendResponse({ success: true });
                    return false; // Sync response

                default:
                    sendResponse({ error: 'Unknown action' });
                    return false;
            }
        };

        chrome.runtime.onMessage.addListener(listener);
    }

    /**
     * Setup page lifecycle event handlers
     */
    setupPageLifecycleHandlers(): void {
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    /**
     * Cleanup resources
     */
    cleanup(): void {
        if (this.ruleDOMManager) {
            this.ruleDOMManager.forceCleanupAll();
        }
        this.isAnalyzing = false;
    }
}
