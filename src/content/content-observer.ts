import { MIN_HEIGHT, MIN_TEXT_LENGTH, MIN_WIDTH } from './content-constants';
import { createLogger } from '../shared/logger';

const logger = createLogger('ContentObserver');

export class ContentObserver {
    static observer: MutationObserver | null = null;

    static reanalyzeCallback: (() => void) | null = null;

    /**
     * Initialize mutation observer for dynamic content
     * @param reanalyzeCallback Callback function to trigger re-analysis when new content is detected
     */
    static initialize(reanalyzeCallback: () => void): void {
        if (ContentObserver.observer) {
            ContentObserver.observer.disconnect();
        }

        ContentObserver.reanalyzeCallback = reanalyzeCallback;

        if (!document.body) {
            logger.debug('document.body not available, waiting for DOMContentLoaded');
            window.addEventListener('DOMContentLoaded', () => {
                ContentObserver.initialize(reanalyzeCallback);
            });
            return;
        }

        ContentObserver.observer = new MutationObserver((mutations) => {
            let shouldReanalyze = false;

            mutations.forEach((mutation) => {
                if (mutation.type !== 'childList') return;

                // Check if any added nodes are significant elements
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return;

                    const element = node as Element;
                    const rect = element.getBoundingClientRect();

                    // Check if it's a significant element (has size and text)
                    const hasSize = rect.width >= MIN_WIDTH
                        && rect.height >= MIN_HEIGHT;
                    const text = element.textContent?.trim();
                    const hasText = text && text.length > MIN_TEXT_LENGTH;

                    if (!hasSize || !hasText) return;

                    const tag = element.tagName.toLowerCase();
                    const cls = element.className
                        ? `.${element.className}`
                        : '';
                    const msg = `🆕 Dynamic element detected: ${tag}${cls}`;
                    logger.info(msg);
                    shouldReanalyze = true;
                });
            });

            if (shouldReanalyze && ContentObserver.reanalyzeCallback) {
                logger.info('🔄 Re-analyzing page due to dynamic content...');
                // Debounced re-analysis to avoid excessive calls
                setTimeout(() => {
                    ContentObserver.reanalyzeCallback?.();
                }, 500);
            }
        });

        // Start observing
        ContentObserver.observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        logger.info('👁️ MutationObserver setup for dynamic content');
    }

    /**
     * Disconnect the observer
     */
    static disconnect(): void {
        if (ContentObserver.observer) {
            ContentObserver.observer.disconnect();
            ContentObserver.observer = null;
            ContentObserver.reanalyzeCallback = null;
            logger.info('👁️ MutationObserver disconnected');
        }
    }
}
