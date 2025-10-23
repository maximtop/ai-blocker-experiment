// Shared DOM Observer - Broadcasts DOM mutations to subscribers
// Simple pub-sub pattern for DOM changes

import { createLogger } from '../shared/logger';

const logger = createLogger('DOMObserver');

/**
 * Shared observer for DOM mutations
 * Broadcasts mutations to all subscribers who can filter and act as needed
 */
export class DOMObserver {
    /**
     * Set of subscriber callbacks
     */
    private subscribers: Set<(mutations: MutationRecord[]) => void>;

    /**
     * MutationObserver instance for watching DOM changes
     */
    private mutationObserver: MutationObserver | null;

    /**
     * Whether the observer is initialized
     */
    private initialized: boolean;

    constructor() {
        this.subscribers = new Set();
        this.mutationObserver = null;
        this.initialized = false;
    }

    /**
     * Subscribe to DOM mutations
     * @param callback Called with mutations when DOM changes
     */
    subscribe(callback: (mutations: MutationRecord[]) => void): void {
        this.subscribers.add(callback);
        logger.info(`Subscriber added, total: ${this.subscribers.size}`);
    }

    /**
     * Unsubscribe from DOM mutations
     * @param callback Function to remove
     */
    unsubscribe(callback: (mutations: MutationRecord[]) => void): void {
        this.subscribers.delete(callback);
        logger.info(`Subscriber removed, total: ${this.subscribers.size}`);
    }

    /**
     * Initialize the DOM observer
     */
    init(): void {
        if (this.initialized) {
            return;
        }

        this.setupMutationObserver();
        this.initialized = true;

        logger.info('DOM observer initialized');
    }

    /**
     * Set up MutationObserver to watch for DOM changes
     */
    setupMutationObserver(): void {
        this.mutationObserver = new MutationObserver((mutations) => {
            // Broadcast mutations to all subscribers
            for (const callback of this.subscribers) {
                try {
                    callback(mutations);
                } catch (error) {
                    logger.error('Subscriber callback error:', error);
                }
            }
        });

        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });

        logger.info('MutationObserver started');
    }

    /**
     * Disconnect the mutation observer
     */
    disconnect(): void {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        this.initialized = false;
        logger.info('DOM observer disconnected');
    }

    /**
     * Clear all subscribers
     */
    clearSubscribers(): void {
        this.subscribers.clear();
        logger.info('All subscribers cleared');
    }
}

// Export singleton instance
export const domObserver = new DOMObserver();
