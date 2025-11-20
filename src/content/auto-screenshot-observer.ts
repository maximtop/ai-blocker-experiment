import {
    ACTIONS,
    AUTO_SCREENSHOT_CONFIG,
    GROUND_TRUTH,
    GroundTruthLabel,
    PORT_NAMES,
} from '../shared/constants';
import { createLogger } from '../shared/logger';
import type {
    ScreenshotResponse,
    VisionAnalysisResult,
    VisionRule,
} from '../shared/rule-types';
import { BlurManager } from './blur-manager';
import { BLUR_MODE } from './content-constants';
import { domObserver } from './dom-observer';

const logger = createLogger('AutoScreenshotObserver');

/**
 * Element bounds for screenshot capture
 */
interface ElementBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom: number;
    marginTop: number;
    marginSides: number;
    velocityFactor: number;
}

/**
 * Cache information for image analysis
 */
interface CacheInfo {
    innerText: string;
    groundTruth?: GroundTruthLabel;
}

/**
 * Observes DOM for target elements and automatically captures screenshots
 * when they become visible, then applies blur
 */
export class AutoScreenshotObserver {
    /**
     * Tracks elements currently being processed (screenshot + analysis)
     * Uses WeakSet for automatic garbage collection of removed elements
     */
    private observedElements: WeakSet<Element>;

    /**
     * Tracks elements already registered with IntersectionObserver
     * Prevents duplicate IntersectionObserver.observe() calls
     */
    private registeredElements: WeakSet<Element>;

    /**
     * Maps elements to their vision criteria for analysis
     */
    private elementCriteria: WeakMap<Element, string>;

    /**
     * Vision rules loaded from background
     */
    private visionRules: VisionRule[];

    /**
     * Combined CSS selector from all enabled vision rules
     */
    private combinedSelector: string | null;

    /**
     * Monitors viewport visibility to trigger screenshots when elements
     * become fully visible (100% threshold)
     */
    private intersectionObserver: IntersectionObserver | null;

    /**
     * Last scroll position for calculating velocity
     */
    private lastScrollY: number;

    /**
     * Last scroll timestamp for calculating velocity
     */
    private lastScrollTime: number;

    /**
     * Current scroll velocity in pixels per second
     */
    private scrollVelocity: number;

    constructor() {
        this.observedElements = new WeakSet();
        this.registeredElements = new WeakSet();
        this.elementCriteria = new WeakMap();
        this.visionRules = [];
        this.combinedSelector = null;
        this.intersectionObserver = null;
        this.lastScrollY = window.scrollY;
        this.lastScrollTime = Date.now();
        this.scrollVelocity = 0;
    }

    /**
     * Initialize the observer and start watching for target elements
     * @param visionRules Array of vision rules from background
     */
    init(visionRules: VisionRule[] = []): void {
        logger.info('Initializing auto-screenshot observer');
        this.visionRules = visionRules;
        this.buildCombinedSelector();
        logger.info(
            `Loaded ${this.visionRules.length} vision rules`,
        );

        this.setupScrollTracking();
        this.setupIntersectionObserver();
        this.subscribeToDOM();

        // Check for existing elements now
        this.observeExistingElements();

        // Re-check after DOM is fully loaded (elements might be added dynamically)
        if (document.readyState === 'loading') {
            logger.info('📸 Document still loading, will re-check after DOMContentLoaded');
            document.addEventListener('DOMContentLoaded', () => {
                logger.info('📸 DOMContentLoaded fired, re-checking for existing elements');
                this.observeExistingElements();
            });
        } else {
            logger.info('📸 Document already loaded, scheduling re-check');
            // Document already loaded, schedule a re-check for dynamically added content
            setTimeout(() => {
                logger.info('📸 Re-checking for existing elements after timeout');
                this.observeExistingElements();
            }, 100);
        }
    }

    /**
     * Build combined CSS selector from all vision rules
     */
    buildCombinedSelector(): void {
        if (this.visionRules.length === 0) {
            this.combinedSelector = null;
            logger.debug('No vision rules available');
            return;
        }

        this.combinedSelector = this.visionRules
            .map((rule) => rule.selector)
            .join(', ');

        logger.info(`Combined selector: ${this.combinedSelector}`);
    }

    /**
     * Subscribe to DOM mutations from shared observer
     */
    subscribeToDOM(): void {
        if (!this.combinedSelector) {
            logger.debug('No selector available, skipping DOM subscription');
            return;
        }

        domObserver.subscribe((mutations) => {
            this.handleMutations(mutations);
        });

        logger.info('Subscribed to DOM observer');
    }

    /**
     * Handle DOM mutations - check for new elements matching vision rules
     * @param mutations Array of mutation records
     */
    handleMutations(mutations: MutationRecord[]): void {
        if (!this.combinedSelector) {
            return;
        }

        let checkedCount = 0;
        let matchedCount = 0;
        let childrenFound = 0;

        for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;

                const element = node as Element;
                checkedCount += 1;

                // Check the element itself
                try {
                    if (element.matches(this.combinedSelector)) {
                        matchedCount += 1;
                        logger.info(
                            '📸 Found matching element: '
                            + `${element.tagName}.`
                            + `${(element as HTMLElement).className}`,
                        );
                        this.checkAndObserveElement(element);
                    }
                } catch (error) {
                    // Ignore elements that can't be matched
                    logger.debug(`📸 Could not match element: ${error}`);
                }

                // Also check children (critical for large container additions)
                try {
                    const targetElements = element.querySelectorAll(
                        this.combinedSelector,
                    );
                    if (targetElements.length > 0) {
                        childrenFound += targetElements.length;
                        logger.info(
                            `📸 Found ${targetElements.length} `
                            + 'matching child elements in '
                            + `${element.tagName}.`
                            + `${(element as HTMLElement).className || '(no class)'}`,
                        );
                        for (const childElement of Array.from(targetElements)) {
                            matchedCount += 1;
                            this.checkAndObserveElement(childElement);
                        }
                    }
                } catch (error) {
                    logger.debug(`📸 Could not query children: ${error}`);
                }
            }
        }

        if (checkedCount > 0) {
            logger.debug(
                `📸 Mutation: ${checkedCount} elements, `
                + `${matchedCount} matched `
                + `(${childrenFound} via children), `
                + `selector: "${this.combinedSelector}"`,
            );
        }
    }

    /**
     * Check if element matches vision rule selectors and start observing
     * @param element Element to check and observe
     */
    checkAndObserveElement(element: Element): void {
        if (!this.combinedSelector || !this.intersectionObserver) {
            logger.warn(
                '📸 Cannot check element: '
                + `selector=${!!this.combinedSelector}, `
                + `observer=${!!this.intersectionObserver}`,
            );
            return;
        }

        if (element.matches(this.combinedSelector)) {
            // Check if already registered with IntersectionObserver
            if (!this.registeredElements.has(element)) {
                // Find which rule matched and store its criteria
                const matchedRule = this.visionRules.find(
                    (rule) => element.matches(rule.selector),
                );

                if (matchedRule) {
                    this.elementCriteria.set(element, matchedRule.criteria);
                    this.intersectionObserver.observe(element);
                    this.registeredElements.add(element);
                    logger.info(
                        '📸 Started observing element '
                        + `${element.tagName}.${element.className} `
                        + `with criteria: ${matchedRule.criteria}`,
                    );
                } else {
                    logger.warn(
                        '📸 Element matched selector but no rule found: '
                        + `${element.tagName}.${element.className}`,
                    );
                }
            } else {
                logger.debug(
                    '📸 Element already registered: '
                    + `${element.tagName}.${element.className}`,
                );
            }
        }
    }

    /**
     * Find and observe all existing elements matching vision rule selectors
     */
    observeExistingElements(): void {
        if (!this.combinedSelector) {
            logger.debug('No selector available, skipping existing elements');
            return;
        }

        const elements = document.querySelectorAll(this.combinedSelector);
        logger.info(
            `📸 Found ${elements.length} existing target elements `
            + `matching "${this.combinedSelector}"`,
        );

        if (elements.length === 0) {
            // Try to find similar elements to help debug
            const parts = this.combinedSelector.split('.');
            if (parts.length > 1) {
                const firstClass = parts[1];
                const similarElements = document.querySelectorAll(
                    `.${firstClass}`,
                );
                logger.info(
                    `📸 Debug: Found ${similarElements.length} elements `
                    + `with class ".${firstClass}"`,
                );
                if (similarElements.length > 0 && similarElements.length < 10) {
                    Array.from(similarElements).forEach((el) => {
                        const elClass = (el as HTMLElement).className;
                        logger.info(`📸   - ${el.tagName}.${elClass}`);
                    });
                }
            }
        }

        Array.from(elements).forEach((element) => {
            this.checkAndObserveElement(element);
        });
    }

    /**
     * Track scroll velocity for dynamic margin calculation
     */
    setupScrollTracking(): void {
        window.addEventListener('scroll', () => {
            const now = Date.now();
            const currentScrollY = window.scrollY;
            const timeDelta = now - this.lastScrollTime;
            const scrollDelta = Math.abs(currentScrollY - this.lastScrollY);

            // Calculate velocity in pixels per second
            if (timeDelta > 0) {
                this.scrollVelocity = (scrollDelta / timeDelta) * 1000;
            }

            this.lastScrollY = currentScrollY;
            this.lastScrollTime = now;
        }, { passive: true });
    }

    /**
     * Set up IntersectionObserver to detect when elements are fully visible
     */
    setupIntersectionObserver(): void {
        this.intersectionObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const element = entry.target;
                    const isFullyVisible = entry.isIntersecting
                        && entry.intersectionRatio
                            >= AUTO_SCREENSHOT_CONFIG.VISIBILITY_THRESHOLD;

                    const elClass = (element as HTMLElement).className;
                    logger.debug(
                        '📸 IntersectionObserver callback: '
                        + `${element.tagName}.${elClass} - `
                        + `intersecting=${entry.isIntersecting}, `
                        + `ratio=${entry.intersectionRatio.toFixed(2)}, `
                        + `fullyVisible=${isFullyVisible}`,
                    );

                    if (isFullyVisible) {
                        this.handleElementFullyVisible(entry.target);
                    }
                });
            },
            {
                threshold: AUTO_SCREENSHOT_CONFIG.VISIBILITY_THRESHOLD,
            },
        );
        logger.info('📸 IntersectionObserver created and ready');
    }

    /**
     * Handle element when it becomes fully visible
     * @param element Fully visible element
     */
    async handleElementFullyVisible(element: Element): Promise<void> {
        if (this.observedElements.has(element) || !this.intersectionObserver) {
            return;
        }

        // Mark as being processed immediately to prevent duplicate captures
        this.observedElements.add(element);

        logger.info('Element fully visible, capturing screenshot');

        // Check if element is still in viewport after waits
        const rect = element.getBoundingClientRect();
        const inViewport = rect.top >= 0
            && rect.left >= 0
            && rect.bottom <= window.innerHeight
            && rect.right <= window.innerWidth;

        if (!inViewport) {
            logger.info(
                'Element scrolled out of viewport, skipping screenshot',
            );
            // Remove from observed set so it can be captured later
            this.observedElements.delete(element);
            return;
        }

        // Element is visible, capture bounds NOW with scroll velocity
        const bounds = AutoScreenshotObserver.getElementBounds(
            element,
            this.scrollVelocity,
        );

        // Get the vision criteria for this element
        const criteria = this.elementCriteria.get(element) || 'unknown';

        // Use element's innerText as cache key for simplicity
        // TODO: Handle cases when multiple elements have the same innerText
        // For now, we assume all elements for visual analysis have
        // different innerText

        // Extract ground truth label if present (for testing/benchmarking)
        const groundTruthAttr = element.getAttribute('data-ground-truth');
        const groundTruth = (
            groundTruthAttr === GROUND_TRUTH.AD
            || groundTruthAttr === GROUND_TRUTH.NOT_AD
        )
            ? (groundTruthAttr as GroundTruthLabel)
            : undefined;

        const innerText = (element as HTMLElement).innerText?.trim() || '';
        const cacheInfo: CacheInfo = {
            innerText,
            groundTruth,
        };

        // Create a port connection for this screenshot capture
        // This maintains the element context without fragile innerText matching
        const port = chrome.runtime.connect({
            name: PORT_NAMES.SCREENSHOT_CAPTURE,
        });

        port.onMessage.addListener((message) => {
            if (message.action === ACTIONS.SCREENSHOT_CAPTURED) {
                logger.info(
                    `📸 [${message.filename}] Screenshot captured via port, `
                    + 'applying blur now',
                );
                BlurManager.blur(element, { mode: BLUR_MODE.ANALYZING });
            }
        });

        // Start screenshot capture WITHOUT blur
        // The blur will be applied when SCREENSHOT_CAPTURED message arrives via port
        const capturePromise = this.captureScreenshotWithBounds(
            bounds,
            criteria,
            cacheInfo,
            port,
        );

        // Wait for screenshot capture and vision analysis
        const visionResult = await capturePromise;

        // Clean up port connection
        port.disconnect();

        // Handle vision analysis result
        if (visionResult) {
            const confidence = visionResult.confidence || 0;
            const threshold = visionResult.threshold || 0.7;
            const explanation = visionResult.explanation || 'No explanation';
            const filename = visionResult.filename || 'unknown';

            // Log detailed result
            logger.info(
                `📸 [${filename}] Vision analysis result received:`,
            );
            logger.info(
                `📸 [${filename}] - Matches: ${visionResult.matches}`,
            );
            const confPct = (confidence * 100).toFixed(1);
            logger.info(
                `📸 [${filename}] - Confidence: ${confPct}%`,
            );
            logger.info(
                `📸 [${filename}] - Threshold: ${(threshold * 100).toFixed(1)}%`,
            );
            logger.info(
                `📸 [${filename}] - Explanation: ${explanation}`,
            );

            // Apply threshold check: both matches AND confidence >= threshold
            const shouldBlock = visionResult.matches && confidence >= threshold;

            if (shouldBlock) {
                // Advertisement detected - update blocked mode
                const scorePercent = (confidence * 100).toFixed(0);
                const threshPercent = (threshold * 100).toFixed(0);
                const label = `🚫 Ad Blocked ${scorePercent}% `
                    + `(min: ${threshPercent}%)`;

                BlurManager.blur(element, {
                    mode: BLUR_MODE.BLOCKED,
                    label,
                });

                logger.info(
                    `📸 [${filename}] ❌ BLOCKED - Advertisement detected `
                    + `(confidence: ${(confidence * 100).toFixed(1)}%, `
                    + `threshold: ${(threshold * 100).toFixed(1)}%)`,
                );
            } else {
                // Not an advertisement - remove blur
                BlurManager.unblur(element);
                logger.info(
                    `📸 [${filename}] ✅ ALLOWED - Not an advertisement `
                    + `(confidence: ${(confidence * 100).toFixed(1)}%, `
                    + `threshold: ${(threshold * 100).toFixed(1)}%)`,
                );
            }
        } else {
            // No result - remove blur
            BlurManager.unblur(element);
            logger.info('No vision result, blur removed');
        }

        // Stop observing this element
        this.intersectionObserver.unobserve(element);
    }

    /**
     * Get element bounds and viewport information for cropping
     * Includes dynamic margins based on scroll velocity
     * @param element Element to capture
     * @param scrollVelocity Current scroll speed in px/s
     * @returns Element bounds and viewport data
     */
    static getElementBounds(
        element: Element,
        scrollVelocity = 0,
    ): ElementBounds {
        const rect = element.getBoundingClientRect();
        const zoom = window.devicePixelRatio;

        // Calculate dynamic margins based on scroll velocity
        // Faster scroll = slightly larger margins (reduced from previous)
        const velocityFactor = Math.min(scrollVelocity / 2000, 2);
        const marginTop = AUTO_SCREENSHOT_CONFIG.MARGIN_TOP
            + (velocityFactor * 15);
        const marginBottom = AUTO_SCREENSHOT_CONFIG.MARGIN_BOTTOM
            + (velocityFactor * 15);
        const marginSides = AUTO_SCREENSHOT_CONFIG.MARGIN_LEFT
            + (velocityFactor * 5);

        // Apply margins to expand capture area
        const x = Math.max(0, rect.left - marginSides);
        const y = Math.max(0, rect.top - marginTop);
        const width = rect.width + (marginSides * 2);
        const height = rect.height + marginTop + marginBottom;

        return {
            x: x * zoom,
            y: y * zoom,
            width: width * zoom,
            height: height * zoom,
            zoom,
            marginTop,
            marginSides,
            velocityFactor,
        };
    }

    /**
     * Capture and crop screenshot using pre-captured bounds
     * @param bounds Pre-captured element bounds
     * @param criteria Vision criteria for this element
     * @param cacheInfo Cache information for stable identification
     * @param port Port connection for receiving screenshot notifications
     * @returns Vision analysis result or null
     */
    async captureScreenshotWithBounds(
        bounds: ElementBounds,
        criteria: string,
        cacheInfo: CacheInfo,
        port: chrome.runtime.Port,
    ): Promise<VisionAnalysisResult | null> {
        try {
            logger.info(`Element bounds: ${JSON.stringify(bounds)}`);
            logger.info(`Vision criteria: ${criteria}`);
            logger.info(`Cache info: ${JSON.stringify(cacheInfo)}`);

            // Send screenshot request via port (not regular message)
            // This ties the request to this specific port connection
            port.postMessage({
                action: ACTIONS.CAPTURE_PAGE_SCREENSHOT,
                bounds,
                criteria,
                cacheInfo,
            });

            // Wait for response via port
            const response = await new Promise<ScreenshotResponse>((
                resolve,
                reject,
            ) => {
                const messageListener = (message: unknown) => {
                    const msg = message as ScreenshotResponse;
                    if (msg.success !== undefined) {
                        port.onMessage.removeListener(messageListener);
                        resolve(msg);
                    }
                };

                const disconnectListener = () => {
                    port.onMessage.removeListener(messageListener);
                    reject(new Error('Port disconnected'));
                };

                port.onMessage.addListener(messageListener);
                port.onDisconnect.addListener(disconnectListener);
            });

            if (response.success) {
                logger.info(
                    `📸 [${response.filename}] Screenshot captured and saved`,
                );
                if (response.visionAnalysis) {
                    // Add filename to vision result for tracking
                    return {
                        ...response.visionAnalysis,
                        filename: response.filename,
                    };
                }
            } else {
                logger.error(
                    `📸 Screenshot capture failed: ${response.error}`,
                );
            }
            return null;
        } catch (error) {
            logger.error('Failed to capture element screenshot:', error);
            return null;
        }
    }

    /**
     * Disconnect all observers
     */
    disconnect(): void {
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
        // DOM observer is shared, don't disconnect it
        logger.info('Auto-screenshot observer disconnected');
    }
}
