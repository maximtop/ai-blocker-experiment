import { createLogger } from '../shared/logger';
import {
    BLUR_MODE,
    MIN_BLUR_HEIGHT,
    MIN_BLUR_WIDTH,
} from './content-constants';

const logger = createLogger('BlurOverlay');

/**
 * Blur options for creating/updating overlays
 */
interface BlurOptions {
    mode?: string;
    radius?: number;
    label?: string;
}

/**
 * Internal blur entry state
 */
interface BlurEntry {
    shadowHost: HTMLDivElement;
    shadow: ShadowRoot;
    layer: HTMLDivElement;
    btn: HTMLButtonElement;
    mode: string;
    resizeObserver: ResizeObserver;
}

// FIXME make sure that blur is only for visible elements,
// this is needed for performance
/**
 * BlurManager: manages per-element blur overlays
 */
export class BlurManager {
    /**
     * Internal state per element
     */
    static state = new WeakMap<Element, BlurEntry>();

    /**
     * Set of elements that have blurs (for iteration)
     */
    static elements = new Set<Element>();

    /**
     * Animation frame ID for continuous position tracking
     */
    static trackingAnimationFrame: number | null = null;

    /**
     * Flag to track if position tracking loop is active
     */
    static isTrackingActive = false;

    /**
     * Create or update a blur for el
     * @param el The element to blur
     * @param options Blur options
     * @returns Cleanup function to remove blur, or null if blur couldn't be created
     */
    static blur(el: Element, options: BlurOptions = {}): (() => void) | null {
        if (!el || !(el instanceof Element)) {
            return null;
        }

        // Small element guard
        const rect = el.getBoundingClientRect();
        if (rect.width < MIN_BLUR_WIDTH || rect.height < MIN_BLUR_HEIGHT) {
            const msg = 'Skipping blur (too small): '
                + `${rect.width}x${rect.height}`;
            logger.debug(msg);
            return null;
        }

        const existing = BlurManager.state.get(el);
        if (existing) {
            // Update mode/label for existing shadow DOM overlay
            const mode = options.mode ?? existing.mode ?? BLUR_MODE.ANALYZING;
            const isBlocked = mode === BLUR_MODE.BLOCKED;
            const isSafe = mode === BLUR_MODE.SAFE;
            existing.mode = mode;

            // Update button text and style
            let text = 'Analyzing...';
            let btnBg = 'rgba(0,0,0,0.7)';
            let layerBg = 'rgba(255,255,255,0.01)';

            if (isBlocked) {
                text = '🚫 Ad Blocked';
                btnBg = 'rgba(255,71,87,0.9)';
                layerBg = 'rgba(255,71,87,0.15)';
            } else if (isSafe) {
                text = '✓ Safe';
                btnBg = 'rgba(76,175,80,0.9)';
                layerBg = 'rgba(76,175,80,0.1)';
            }

            existing.btn.textContent = options.label ?? text;
            existing.btn.style.background = btnBg;
            existing.layer.style.background = layerBg;

            BlurManager.state.set(el, existing);
            // Return cleanup function for existing blur
            return () => BlurManager.unblur(el);
        }

        const entry = BlurManager.createOverlay(el, options);
        BlurManager.state.set(el, entry);
        BlurManager.elements.add(el);

        // Start continuous position tracking if this is the first blur
        BlurManager.startPositionTracking();

        logger.debug(`Blur mounted. Total active: ${BlurManager.stateSize()}`);
        // Return cleanup function for new blur
        return () => BlurManager.unblur(el);
    }

    /**
     * Remove blur for el
     * @param el The element to unblur
     */
    static unblur(el: Element): void {
        const entry = BlurManager.state.get(el);
        if (!entry) {
            return;
        }
        BlurManager.destroyOverlay(entry);
        BlurManager.state.delete(el);
        BlurManager.elements.delete(el);

        // Stop position tracking if no more blurs
        if (BlurManager.elements.size === 0) {
            BlurManager.stopPositionTracking();
        }

        logger.debug(`Blur removed. Total active: ${BlurManager.stateSize()}`);
    }

    /**
     * Optional: remove all overlays
     */
    static unblurAll(): void {
        const elements = Array.from(BlurManager.elements);
        for (const el of elements) {
            const entry = BlurManager.state.get(el);
            if (entry) {
                BlurManager.destroyOverlay(entry);
            }
            BlurManager.state.delete(el);
            BlurManager.elements.delete(el);
        }

        // Stop position tracking
        BlurManager.stopPositionTracking();

        const msg = 'All blurs removed. Total active: '
            + `${BlurManager.stateSize()}`;
        logger.info(msg);
    }

    /**
     * Optional debug
     * @param el Element to check
     * @returns True if element is blurred
     */
    static isBlurred(el: Element): boolean {
        return BlurManager.state.has(el);
    }

    /**
     * Optional debug
     */
    static debugStatus(): void {
        const count = BlurManager.stateSize();
        const msg = `State count=${count} active blurs`;
        logger.debug(msg);
    }

    /**
     * Get state size for debugging
     * @returns State size
     */
    static stateSize(): number {
        // Use elements Set size since WeakMap is not iterable
        return BlurManager.elements.size;
    }

    /**
     * Start continuous position tracking loop using requestAnimationFrame
     */
    static startPositionTracking(): void {
        if (BlurManager.isTrackingActive) {
            return; // Already tracking
        }

        BlurManager.isTrackingActive = true;
        logger.info('🎯 Starting continuous position tracking');

        const trackLoop = () => {
            if (!BlurManager.isTrackingActive) {
                return; // Stop the loop
            }

            // Update all overlay positions
            BlurManager.updateAllPositions();

            // Schedule next frame
            BlurManager.trackingAnimationFrame = requestAnimationFrame(
                trackLoop,
            );
        };

        // Start the loop
        trackLoop();
    }

    /**
     * Stop continuous position tracking
     */
    static stopPositionTracking(): void {
        if (!BlurManager.isTrackingActive) {
            return;
        }

        BlurManager.isTrackingActive = false;

        if (BlurManager.trackingAnimationFrame) {
            cancelAnimationFrame(BlurManager.trackingAnimationFrame);
            BlurManager.trackingAnimationFrame = null;
        }

        logger.info('⏹️ Stopped position tracking');
    }

    /**
     * Update positions of all visible blur overlays
     */
    static updateAllPositions(): void {
        const { scrollY, scrollX } = window;

        for (const el of BlurManager.elements) {
            const entry = BlurManager.state.get(el);
            if (!entry || !entry.shadowHost) {
                continue;
            }

            // Get current element position and size
            const rect = el.getBoundingClientRect();

            // Check if element is visible in viewport
            const isVisible = (
                rect.width > 0
                && rect.height > 0
                && rect.top < window.innerHeight
                && rect.bottom > 0
                && rect.left < window.innerWidth
                && rect.right > 0
            );

            if (!isVisible) {
                // Hide overlay if element not visible
                if (entry.shadowHost.style.display !== 'none') {
                    entry.shadowHost.style.display = 'none';
                }
                continue;
            }

            // Show overlay if it was hidden
            if (entry.shadowHost.style.display === 'none') {
                entry.shadowHost.style.display = '';
            }

            // Check if element has fixed positioning
            const isFixed = BlurManager.hasFixedPosition(el);

            // Check current position type
            const currentPosition = entry.shadowHost.style.position;
            const expectedPosition = isFixed ? 'fixed' : 'absolute';

            // Update position type if it changed
            if (currentPosition !== expectedPosition) {
                entry.shadowHost.style.position = expectedPosition;
            }

            // Calculate new position
            const newTop = isFixed ? rect.top : rect.top + scrollY;
            const newLeft = isFixed ? rect.left : rect.left + scrollX;
            const newWidth = rect.width;
            const newHeight = rect.height;

            // Get current values
            const currentTop = Number.parseFloat(
                entry.shadowHost.style.top,
            );
            const currentLeft = Number.parseFloat(
                entry.shadowHost.style.left,
            );
            const currentWidth = Number.parseFloat(
                entry.shadowHost.style.width,
            );
            const currentHeight = Number.parseFloat(
                entry.shadowHost.style.height,
            );

            // Only update if position or size changed (>0.5px)
            const posChanged = Math.abs(currentTop - newTop) > 0.5
                || Math.abs(currentLeft - newLeft) > 0.5;
            const sizeChanged = Math.abs(currentWidth - newWidth) > 0.5
                || Math.abs(currentHeight - newHeight) > 0.5;

            if (posChanged || sizeChanged) {
                entry.shadowHost.style.top = `${newTop}px`;
                entry.shadowHost.style.left = `${newLeft}px`;
                entry.shadowHost.style.width = `${newWidth}px`;
                entry.shadowHost.style.height = `${newHeight}px`;
            }
        }
    }

    /**
     * Check if element or any parent has fixed positioning
     * @param el Element to check
     * @returns True if element or parent is fixed
     */
    static hasFixedPosition(el: Element): boolean {
        let current: Element | null = el;
        while (current && current !== document.body) {
            const { position } = getComputedStyle(current);
            if (position === 'fixed') {
                return true;
            }
            current = current.parentElement;
        }
        return false;
    }

    /**
     * Get the effective z-index for an element
     * @param el Element to check
     * @returns Element's z-index value, or 0 if none
     */
    static getEffectiveZIndex(el: Element): number {
        const { position, zIndex: zIndexValue } = getComputedStyle(el);

        // Only consider z-index if element has positioning context
        if (position !== 'static') {
            const zIndex = Number.parseInt(zIndexValue, 10);
            if (!Number.isNaN(zIndex)) {
                return zIndex;
            }
        }

        return 0;
    }

    /**
     * Internal cleanup for a single overlay entry
     * @param entry The blur entry to destroy
     */
    static destroyOverlay(entry: BlurEntry): void {
        if (!entry) {
            return;
        }
        try {
            // Disconnect ResizeObserver if present
            if (entry.resizeObserver) {
                entry.resizeObserver.disconnect();
            }
            // Remove shadow host from body
            if (entry.shadowHost?.parentNode) {
                entry.shadowHost.remove();
            }
        } catch {
            // Ignore DOM removal errors
        }
    }

    /**
     * Static method defined inside the class
     * @param el Element to create overlay for
     * @param options Blur options
     * @param options.mode The blur mode (analyzing, blocked, or safe)
     * @param options.radius The blur radius in pixels
     * @param options.label Custom label text for the overlay button
     * @returns Blur entry
     */
    static createOverlay(
        el: Element,
        { mode = BLUR_MODE.ANALYZING, radius = 6, label }: BlurOptions = {},
    ): BlurEntry {
        // Check if element has fixed positioning
        const isFixed = BlurManager.hasFixedPosition(el);

        // Get element position relative to document
        const rect = el.getBoundingClientRect();

        // Use fixed positioning for shadow host if element is fixed
        const positionType = isFixed ? 'fixed' : 'absolute';
        const top = isFixed ? rect.top : rect.top + window.scrollY;
        const left = isFixed ? rect.left : rect.left + window.scrollX;

        // Get effective z-index (element or highest child)
        const effectiveZIndex = BlurManager.getEffectiveZIndex(el);
        // Use element's z-index, or 1 if none set
        const overlayZIndex = effectiveZIndex > 0 ? effectiveZIndex : 1;

        // Create shadow host with appropriate positioning
        const shadowHost = document.createElement('div');
        shadowHost.style.cssText = `
            position: ${positionType};
            top: ${top}px;
            left: ${left}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            pointer-events: none;
            z-index: ${overlayZIndex};
        `;

        // Attach shadow DOM (closed mode for stealth)
        const shadow = shadowHost.attachShadow({ mode: 'closed' });

        // Determine mode styling
        const isBlocked = mode === BLUR_MODE.BLOCKED;
        const isSafe = mode === BLUR_MODE.SAFE;

        // Set colors based on mode
        let layerBg = 'rgba(255,255,255,0.01)';
        let btnBg = 'rgba(0,0,0,0.7)';
        let btnText = 'Analyzing...';

        if (isBlocked) {
            layerBg = 'rgba(255,71,87,0.15)';
            btnBg = 'rgba(255,71,87,0.9)';
            btnText = '🚫 Ad Blocked';
        } else if (isSafe) {
            layerBg = 'rgba(76,175,80,0.1)';
            btnBg = 'rgba(76,175,80,0.9)';
            btnText = '✓ Safe';
        }

        // Create overlay inside shadow DOM
        const layer = document.createElement('div');
        Object.assign(layer.style, {
            position: 'absolute',
            inset: '0',
            pointerEvents: 'auto', // block events over the blurred area only
            backdropFilter: `blur(${radius}px)`,
            WebkitBackdropFilter: `blur(${radius}px)`,
            background: layerBg,
            borderRadius: 'inherit',
            overflow: 'hidden', // Clip blur effect to exact element boundaries
        });

        const btn = document.createElement('button');
        btn.textContent = label ?? btnText;
        Object.assign(btn.style, {
            position: 'absolute',
            top: '8px',
            right: '8px',
            pointerEvents: 'auto',
            cursor: 'pointer',
            background: btnBg,
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            fontWeight: 'bold',
            fontFamily: 'system-ui, -apple-system, sans-serif',
        });

        layer.appendChild(btn);
        shadow.appendChild(layer);

        // Append to body instead of as child of element
        document.body.appendChild(shadowHost);

        // Update position function for resize/layout changes
        const updatePosition = () => {
            const newRect = el.getBoundingClientRect();
            shadowHost.style.top = `${newRect.top + window.scrollY}px`;
            shadowHost.style.left = `${newRect.left + window.scrollX}px`;
            shadowHost.style.width = `${newRect.width}px`;
            shadowHost.style.height = `${newRect.height}px`;
        };

        // Use ResizeObserver to track element size/position changes
        const resizeObserver = new ResizeObserver(() => {
            updatePosition();
        });
        resizeObserver.observe(el);

        // Block interactions with the underlying element
        const block = (e: Event) => {
            e.stopPropagation();
            e.preventDefault();
        };
        layer.addEventListener('click', block);
        layer.addEventListener('pointerdown', block);
        // Note: contextmenu NOT blocked for right-click menus
        layer.addEventListener('mousedown', block);
        layer.addEventListener('touchstart', block);

        btn.addEventListener(
            'click',
            (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Allow manual unblur via button
                BlurManager.unblur(el);
            },
            { capture: true },
        );

        return {
            shadowHost,
            shadow,
            layer,
            btn,
            mode,
            resizeObserver,
        };
    }
}
