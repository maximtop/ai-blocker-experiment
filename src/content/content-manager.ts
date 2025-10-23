import { ACTIONS, RULE_TYPE } from '../shared/constants';
import { createLogger } from '../shared/logger';
import { Messaging } from '../shared/messaging';
import type { Rule, VisionRule } from '../shared/rule-types';
import { AutoScreenshotObserver } from './auto-screenshot-observer';
import { ContentAnalyzer } from './content-analyzer';
import { domObserver } from './dom-observer';

const logger = createLogger('ContentManager');

/**
 * Content manager - Handles content script initialization and lifecycle
 */
class ContentManager {
    /**
     * Global analyzer instance
     */
    contentAnalyzer: ContentAnalyzer | null = null;

    /**
     * Auto-screenshot observer instance
     */
    autoScreenshotObserver: AutoScreenshotObserver | null = null;

    /**
     * Initialize content analyzer with pre-fetched rules
     * @param rules Array of analysis rules (embedding/prompt)
     * @returns The initialized content analyzer instance
     */
    initializeContentAnalyzer(rules: Rule[]): ContentAnalyzer {
        if (!this.contentAnalyzer) {
            this.contentAnalyzer = new ContentAnalyzer();
            this.contentAnalyzer.initialize(rules);
        }
        return this.contentAnalyzer;
    }

    /**
     * Initialize auto-screenshot observer with vision rules
     * @param visionRules Array of vision rules
     */
    initializeAutoScreenshotObserver(
        visionRules: VisionRule[],
    ): void {
        if (!this.autoScreenshotObserver) {
            this.autoScreenshotObserver = new AutoScreenshotObserver();
            this.autoScreenshotObserver.init(visionRules);
        }
    }

    /**
     * Fetch rules from background and initialize all content scripts
     */
    async fetchAndInitialize(): Promise<void> {
        try {
            // Check if blocking is enabled via background messaging
            const statusResponse = await Messaging.sendMessage({
                action: ACTIONS.GET_BLOCKING_STATUS,
            });

            if (!statusResponse.blockingEnabled) {
                logger.info('Blocking is disabled, skipping initialization');
                return;
            }

            // Fetch all rules once
            logger.info('Fetching rules from background...');
            const response = await Messaging.sendMessage({
                action: ACTIONS.GET_RULES,
            });

            const allRules = response.rules;

            // Separate rules by type
            const visionRules = allRules.filter(
                (rule): rule is VisionRule => (
                    rule.type === RULE_TYPE.VISION && rule.enabled
                ),
            );
            const analysisRules = allRules.filter(
                (rule) => (rule.type === RULE_TYPE.EMBEDDING
                    || rule.type === RULE_TYPE.PROMPT) && rule.enabled,
            );

            logger.info(
                `Loaded ${visionRules.length} vision rules, `
                + `${analysisRules.length} analysis rules`,
            );

            // Skip initialization if no enabled rules
            if (analysisRules.length === 0 && visionRules.length === 0) {
                logger.info('No enabled rules, skipping initialization');
                return;
            }

            // Initialize shared DOM observer first
            domObserver.init();

            // Initialize content analyzer with analysis rules
            this.initializeContentAnalyzer(analysisRules);

            // Initialize auto-screenshot observer with vision rules
            this.initializeAutoScreenshotObserver(visionRules);
        } catch (error) {
            logger.error('Failed to initialize content scripts:', error);
        }
    }

    /**
     * Initialize content manager
     * Fetches rules immediately to reduce delay before blur appears
     */
    init(): void {
        // Fetch rules immediately, don't wait for DOMContentLoaded
        this.fetchAndInitialize();
    }
}

export const contentManager = new ContentManager();
