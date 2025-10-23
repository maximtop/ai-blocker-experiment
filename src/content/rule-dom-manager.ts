// Rule DOM Manager - Handles DOM operations for rule application

import { createLogger } from '../shared/logger';
import type { CandidateElement, Rule } from '../shared/rule-types';
import { BlurManager } from './blur-manager';
import {
    BLUR_MODE,
    MIN_BLUR_HEIGHT,
    MIN_BLUR_WIDTH,
} from './content-constants';

const logger = createLogger('RuleDOMManager');

/**
 * Blocked element with metadata
 */
interface BlockedElement {
    element: Element;
    rule: string;
    ruleId?: string;
    confidence?: number;
    threshold?: number;
    blockedAt: number;
    cleanup: () => void;
}

export class RuleDOMManager {
    /**
     * Track elements currently blurred during analysis
     */
    private activeBlurs: Set<() => void>;

    /**
     * Track all blocked elements with metadata
     */
    private blockedElements: BlockedElement[];

    /**
     * Track all analyzed elements (both safe and blocked)
     */
    private analyzedElements: Set<Element>;

    constructor() {
        this.activeBlurs = new Set();
        this.blockedElements = [];
        this.analyzedElements = new Set();
    }

    /**
     * Find DOM elements matching a parsed rule
     * @param rule Parsed rule object with selector
     * @returns Array of candidate elements with metadata
     */
    static findElementsByRule(rule: Rule): CandidateElement[] {
        const candidates: CandidateElement[] = [];
        let elements: NodeListOf<Element>;

        try {
            elements = document.querySelectorAll(rule.selector);
        } catch (error) {
            const errMsg = (error as Error).message;
            const msg = `Invalid selector "${rule.selector}": ${errMsg}`;
            logger.error(msg);
            return candidates;
        }

        elements.forEach((element) => {
            const rect = element.getBoundingClientRect();
            const text = element.textContent?.trim() || '';

            // Skip elements that are too small or have no text
            if (rect.width < MIN_BLUR_WIDTH
                || rect.height < MIN_BLUR_HEIGHT
                || !text) {
                return;
            }

            // Skip if element is not visible
            if (rect.width === 0 || rect.height === 0) {
                return;
            }

            candidates.push({
                element,
                text,
                rect,
                selector: rule.selector,
            });
        });

        const msg = `Found ${candidates.length} candidates`
            + ` for selector: ${rule.selector}`;
        logger.debug(msg);
        return candidates;
    }

    /**
     * Apply blur effect to element during analysis
     * @param element DOM element to blur
     * @param mode Blur mode (BLUR_MODE.ANALYZING or BLUR_MODE.BLOCKED)
     * @returns Cleanup function to remove blur
     */
    applyAnalysisBlur(
        element: Element,
        mode: string = BLUR_MODE.ANALYZING,
    ): (() => void) | null {
        const label = mode === BLUR_MODE.BLOCKED
            ? '🚫 Ad blocked'
            : 'Analyzing...';
        const cleanup = BlurManager.blur(
            element,
            { mode, radius: 8, label },
        );

        if (cleanup && mode === BLUR_MODE.ANALYZING) {
            this.activeBlurs.add(cleanup);
        }

        return cleanup;
    }

    /**
     * Apply permanent block to element
     * @param element DOM element to block
     * @param rule Rule that matched this element
     * @param confidence Confidence score of the match
     * @param threshold Threshold used for this rule
     */
    blockElement(
        element: Element,
        rule: Rule,
        confidence?: number,
        threshold?: number,
    ): void {
        // Format label with score and threshold
        let label = '🚫 Blocked';
        if (confidence !== undefined && threshold !== undefined) {
            const scorePercent = (confidence * 100).toFixed(0);
            const threshPercent = (threshold * 100).toFixed(0);
            label = `🚫 Blocked ${scorePercent}% (min: ${threshPercent}%)`;
        }

        // Apply permanent block blur
        const cleanup = BlurManager.blur(element, {
            mode: BLUR_MODE.BLOCKED,
            radius: 8,
            label,
        });

        if (!cleanup) {
            return;
        }

        // Track blocked element
        this.blockedElements.push({
            element,
            rule: rule.ruleString,
            ruleId: rule.id,
            confidence,
            threshold,
            blockedAt: Date.now(),
            cleanup,
        });

        logger.info(`Blocked element with rule: ${rule.ruleString}`);
    }

    /**
     * Remove analysis blur from element
     * @param cleanup Cleanup function returned from applyAnalysisBlur
     */
    removeAnalysisBlur(cleanup: (() => void) | null): void {
        if (!cleanup || typeof cleanup !== 'function') {
            logger.warn(
                `removeAnalysisBlur called with invalid cleanup: ${cleanup}`,
            );
            return;
        }

        const wasInSet = this.activeBlurs.has(cleanup);
        logger.debug(
            'removeAnalysisBlur: cleanup in activeBlurs set: '
            + `${wasInSet}, activeBlurs size: ${this.activeBlurs.size}`,
        );

        try {
            // Always try to call cleanup, even if not in the set
            cleanup();
            if (wasInSet) {
                this.activeBlurs.delete(cleanup);
            }
            logger.debug('Successfully removed analysis blur');
        } catch (error) {
            logger.warn(`Failed to remove analysis blur: ${error}`);
            if (wasInSet) {
                this.activeBlurs.delete(cleanup);
            }
        }
    }

    /**
     * Unblock all blocked elements
     */
    unblockAll(): void {
        let unblocked = 0;

        // Clean up blocked elements
        this.blockedElements.forEach(({ cleanup }) => {
            try {
                cleanup();
                unblocked += 1;
            } catch (error) {
                logger.warn(`Failed to unblock element: ${error}`);
            }
        });

        this.blockedElements = [];
        logger.info(`Unblocked ${unblocked} elements`);
    }

    /**
     * Clean up all active analysis blurs
     */
    cleanupAllBlurs(): void {
        let cleaned = 0;

        // Clean up active analysis blurs
        this.activeBlurs.forEach((cleanup) => {
            try {
                cleanup();
                cleaned += 1;
            } catch (error) {
                logger.warn(`Failed to cleanup blur: ${error}`);
            }
        });

        this.activeBlurs.clear();
        logger.info(`Cleaned up ${cleaned} analysis blurs`);
    }

    /**
     * Force cleanup all blurs (including blocked ones)
     */
    forceCleanupAll(): void {
        this.cleanupAllBlurs();
        this.unblockAll();

        // Also use BlurManager's nuclear option
        BlurManager.unblurAll();

        logger.info('Force cleanup complete');
    }

    /**
     * Get statistics about blocked elements
     * @returns Statistics object
     */
    getBlockedStats(): {
        total: number;
        byRule: Record<string, number>;
    } {
        const stats: Record<string, number> = {};

        this.blockedElements.forEach(({ rule }) => {
            stats[rule] = (stats[rule] || 0) + 1;
        });

        return {
            total: this.blockedElements.length,
            byRule: stats,
        };
    }

    /**
     * Get all blocked elements
     * @returns Array of blocked element metadata
     */
    getBlockedElements(): BlockedElement[] {
        return [...this.blockedElements];
    }

    /**
     * Check if element is currently blocked
     * @param element DOM element to check
     * @returns True if element is blocked
     */
    isElementBlocked(element: Element): boolean {
        return this.blockedElements.some(
            (blocked) => blocked.element === element,
        );
    }

    /**
     * Check if element has been analyzed
     * @param element DOM element to check
     * @returns True if element was already analyzed
     */
    isElementAnalyzed(element: Element): boolean {
        return this.analyzedElements.has(element);
    }

    /**
     * Mark element as analyzed
     * @param element DOM element to mark
     */
    markElementAsAnalyzed(element: Element): void {
        this.analyzedElements.add(element);
    }
}
