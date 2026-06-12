import { ACTIONS } from '../shared/constants';
import { createLogger } from '../shared/logger';
import {
    HTML_IN_CANVAS_CONFIG,
    HTML_IN_CANVAS_ERROR,
    HTML_IN_CANVAS_ERROR_MESSAGE,
} from './content-constants';

const logger = createLogger('HtmlInCanvasScreenshotService');

const CANVAS_IDENTITY_SCALE = 1;
const CANVAS_IDENTITY_SKEW = 0;
const CANVAS_ORIGIN = 0;
const IMAGE_DATA_SAMPLE_SIZE = 1;

/**
 * Canvas element with HTML-in-Canvas fields.
 */
interface HtmlInCanvasElement extends HTMLCanvasElement {
    /** Enables layout for canvas child DOM content */
    layoutSubtree: boolean;
    /** Paint event handler fired after child snapshots are available */
    onpaint: ((event: Event) => void) | null;
    /** Requests a paint event for the next render update */
    requestPaint: () => void;
}

/**
 * Canvas 2D context with experimental DOM drawing method.
 */
interface HtmlInCanvasRenderingContext2D extends CanvasRenderingContext2D {
    /** Draws a canvas child element into the canvas bitmap */
    drawElementImage: (
        element: Element,
        dx: number,
        dy: number,
        dwidth: number,
        dheight: number
    ) => DOMMatrix;
}

/**
 * Element capture size in CSS pixels.
 */
interface CaptureSize {
    /** Capture height in CSS pixels */
    height: number;
    /** Capture width in CSS pixels */
    width: number;
}

/**
 * Runtime support check result for HTML-in-Canvas.
 */
interface CaptureCapability {
    /** Unsupported reason, empty when supported */
    reason: string;
    /** Whether required experimental APIs are available */
    supported: boolean;
}

type ImageDataUrlFetcher = (url: string) => Promise<string | null>;

interface ImageDataUrlMessageResponse {
    dataUrl?: string;
    success?: boolean;
}

/**
 * Renders DOM elements into PNG data URLs with HTML-in-Canvas.
 */
export class HtmlInCanvasScreenshotService {
    /**
     * Check if current browser exposes the required experimental APIs.
     * @returns Capability result and unsupported reason
     */
    static getCapability(): CaptureCapability {
        const canvasCtor = globalThis.HTMLCanvasElement;
        const contextCtor = globalThis.CanvasRenderingContext2D;

        if (!canvasCtor || !contextCtor) {
            return {
                supported: false,
                reason: HTML_IN_CANVAS_ERROR.API_UNAVAILABLE,
            };
        }

        const canvasPrototype = (
            canvasCtor.prototype as Partial<HtmlInCanvasElement>
        );
        const contextPrototype = (
            contextCtor.prototype as Partial<HtmlInCanvasRenderingContext2D>
        );
        const hasCanvasSupport = 'layoutSubtree' in canvasPrototype
            && 'onpaint' in canvasPrototype
            && typeof canvasPrototype.requestPaint === 'function';
        const hasContextSupport = (
            typeof contextPrototype.drawElementImage === 'function'
        );

        return {
            supported: hasCanvasSupport && hasContextSupport,
            reason: hasCanvasSupport && hasContextSupport
                ? ''
                : HTML_IN_CANVAS_ERROR.API_UNAVAILABLE,
        };
    }

    /**
     * Read and validate element capture size.
     * @param element Element to capture
     * @returns Capture width and height in CSS pixels
     * @throws {Error} When dimensions cannot be captured
     */
    static getCaptureSize(element: Element): CaptureSize {
        const rect = element.getBoundingClientRect();
        const width = Math.ceil(rect.width);
        const height = Math.ceil(rect.height);
        const maxDimension = HTML_IN_CANVAS_CONFIG.MAX_DIMENSION;

        if (
            width <= 0
            || height <= 0
            || width > maxDimension
            || height > maxDimension
        ) {
            throw new Error(
                HTML_IN_CANVAS_ERROR_MESSAGE.INVALID_DIMENSIONS,
            );
        }

        return { height, width };
    }

    /**
     * Capture an element as a PNG data URL using HTML-in-Canvas.
     * @param element Element to capture
     * @returns PNG data URL
     * @throws {Error} When the API is unavailable or capture fails
     */
    static async capture(element: Element): Promise<string> {
        const capability = HtmlInCanvasScreenshotService.getCapability();
        if (!capability.supported) {
            throw new Error(capability.reason);
        }

        const size = HtmlInCanvasScreenshotService.getCaptureSize(element);
        const canvas = HtmlInCanvasScreenshotService.createCanvas(size);
        const isImageTarget = element.tagName.toLowerCase()
            === HTML_IN_CANVAS_CONFIG.IMAGE_TAG_NAME;
        const captureRoot = isImageTarget
            ? await HtmlInCanvasScreenshotService.createImageCaptureRoot(
                element as HTMLImageElement,
                size,
                HtmlInCanvasScreenshotService.fetchImageAsDataUrl,
            )
            : HtmlInCanvasScreenshotService.cloneForCapture(element);

        try {
            if (!isImageTarget) {
                await HtmlInCanvasScreenshotService.inlineImageResources(
                    element,
                    captureRoot,
                    HtmlInCanvasScreenshotService.fetchImageAsDataUrl,
                );
                await HtmlInCanvasScreenshotService.waitForAssets(captureRoot);
            }
            canvas.appendChild(captureRoot);
            document.body.appendChild(canvas);
            await HtmlInCanvasScreenshotService.waitForPaint(canvas);
            return HtmlInCanvasScreenshotService.drawSource(
                canvas,
                captureRoot,
            );
        } finally {
            canvas.remove();
        }
    }

    /**
     * Create a staging layoutsubtree canvas.
     * @param size Capture size
     * @returns Staging canvas
     */
    private static createCanvas(size: CaptureSize): HtmlInCanvasElement {
        const canvas = document.createElement('canvas') as HtmlInCanvasElement;
        const ratio = globalThis.devicePixelRatio || 1;
        canvas.layoutSubtree = true;
        canvas.setAttribute(HTML_IN_CANVAS_CONFIG.LAYOUT_SUBTREE_ATTRIBUTE, '');
        canvas.setAttribute(
            HTML_IN_CANVAS_CONFIG.CAPTURE_IGNORE_ATTRIBUTE,
            '',
        );
        canvas.width = Math.ceil(size.width * ratio);
        canvas.height = Math.ceil(size.height * ratio);
        Object.assign(canvas.style, {
            contain: HTML_IN_CANVAS_CONFIG.STAGING_CONTAIN,
            height: `${size.height}px`,
            left: `${HTML_IN_CANVAS_CONFIG.STAGING_LEFT}px`,
            overflow: HTML_IN_CANVAS_CONFIG.STAGING_OVERFLOW,
            pointerEvents: HTML_IN_CANVAS_CONFIG.STAGING_POINTER_EVENTS,
            position: HTML_IN_CANVAS_CONFIG.STAGING_POSITION,
            top: HTML_IN_CANVAS_CONFIG.STAGING_TOP,
            width: `${size.width}px`,
            zIndex: HTML_IN_CANVAS_CONFIG.STAGING_Z_INDEX,
        });
        return canvas;
    }

    /**
     * Build a capture root for image targets using a data-URL background image.
     * @param source Source image element
     * @param size Capture size in CSS pixels
     * @param fetchImageAsDataUrl Image resource resolver
     * @returns Wrapper element to mount inside the staging canvas
     * @throws {Error} When the image resource cannot be inlined
     */
    private static async createImageCaptureRoot(
        source: HTMLImageElement,
        size: CaptureSize,
        fetchImageAsDataUrl: ImageDataUrlFetcher,
    ): Promise<HTMLElement> {
        const imageUrl = source.currentSrc || source.src;
        if (!imageUrl) {
            throw new Error(
                HTML_IN_CANVAS_ERROR_MESSAGE.IMAGE_INLINE_FAILED,
            );
        }

        let dataUrl = imageUrl;

        if (!imageUrl.startsWith(HTML_IN_CANVAS_CONFIG.DATA_URL_PREFIX)) {
            const fetched = await fetchImageAsDataUrl(imageUrl);
            if (!fetched) {
                throw new Error(
                    HTML_IN_CANVAS_ERROR_MESSAGE.IMAGE_INLINE_FAILED,
                );
            }
            dataUrl = fetched;
        }

        const wrapper = document.createElement('div');
        wrapper.setAttribute(
            HTML_IN_CANVAS_CONFIG.CAPTURE_IGNORE_ATTRIBUTE,
            '',
        );
        Object.assign(wrapper.style, {
            backgroundImage: `url("${dataUrl}")`,
            backgroundPosition:
                HTML_IN_CANVAS_CONFIG.BACKGROUND_POSITION_CENTER,
            backgroundRepeat: HTML_IN_CANVAS_CONFIG.BACKGROUND_REPEAT_NONE,
            backgroundSize: HTML_IN_CANVAS_CONFIG.BACKGROUND_SIZE_CONTAIN,
            display: HTML_IN_CANVAS_CONFIG.CAPTURE_ROOT_DISPLAY,
            height: `${size.height}px`,
            margin: HTML_IN_CANVAS_CONFIG.CAPTURE_ZERO_SIZE,
            overflow: HTML_IN_CANVAS_CONFIG.STAGING_OVERFLOW,
            padding: HTML_IN_CANVAS_CONFIG.CAPTURE_ZERO_SIZE,
            width: `${size.width}px`,
        });
        return wrapper;
    }

    /**
     * Clone an element and inline computed styles for best-effort fidelity.
     * @param element Source element
     * @returns Styled clone
     */
    private static cloneForCapture(element: Element): HTMLElement {
        const clone = element.cloneNode(true) as HTMLElement;
        clone.setAttribute(
            HTML_IN_CANVAS_CONFIG.CAPTURE_IGNORE_ATTRIBUTE,
            '',
        );
        HtmlInCanvasScreenshotService.copyComputedStyles(element, clone);
        return clone;
    }

    /**
     * Inline image resources into a cloned subtree so HTML-in-Canvas can paint them.
     * @param source Source element
     * @param clone Cloned element
     * @param fetchImageAsDataUrl Image resource resolver
     * @throws {Error} When an image resource cannot be inlined
     */
    static async inlineImageResources(
        source: Element,
        clone: HTMLElement,
        fetchImageAsDataUrl: ImageDataUrlFetcher,
    ): Promise<void> {
        const sourceImages = HtmlInCanvasScreenshotService
            .getImageElements(source);
        const cloneImages = HtmlInCanvasScreenshotService
            .getImageElements(clone);

        await Promise.all(sourceImages.map(async (sourceImage, index) => {
            const cloneImage = cloneImages[index];
            if (!cloneImage) {
                return;
            }

            const imageUrl = sourceImage.currentSrc || sourceImage.src;
            if (
                !imageUrl
                || imageUrl.startsWith(HTML_IN_CANVAS_CONFIG.DATA_URL_PREFIX)
            ) {
                return;
            }

            const dataUrl = await fetchImageAsDataUrl(imageUrl);
            if (!dataUrl) {
                throw new Error(
                    HTML_IN_CANVAS_ERROR_MESSAGE.IMAGE_INLINE_FAILED,
                );
            }

            cloneImage.removeAttribute(
                HTML_IN_CANVAS_CONFIG.IMAGE_SRCSET_ATTRIBUTE,
            );
            cloneImage.removeAttribute(
                HTML_IN_CANVAS_CONFIG.IMAGE_SIZES_ATTRIBUTE,
            );
            cloneImage.src = dataUrl;
        }));
    }

    /**
     * Copy computed styles from source subtree to clone subtree.
     * @param source Source element
     * @param target Target clone
     */
    private static copyComputedStyles(
        source: Element,
        target: HTMLElement,
    ): void {
        const sourceElements = [
            source,
            ...Array.from(source.querySelectorAll('*')),
        ];
        const targetElements = [
            target,
            ...Array.from(target.querySelectorAll('*')),
        ] as HTMLElement[];

        sourceElements.forEach((sourceElement, index) => {
            const targetElement = targetElements[index];
            if (!targetElement) {
                return;
            }

            const computed = globalThis.getComputedStyle(sourceElement);
            targetElement.style.cssText = Array.from(computed)
                .map((property) => {
                    const value = computed.getPropertyValue(property);
                    return `${property}: ${value};`;
                })
                .join(' ');
        });
    }

    /**
     * Wait for fonts and images inside the clone before painting.
     * @param root Cloned root element
     */
    private static async waitForAssets(root: HTMLElement): Promise<void> {
        if (document.fonts) {
            await document.fonts.ready;
        }

        const images = HtmlInCanvasScreenshotService.getImageElements(root);
        await Promise.all(images.map((image) => (
            HtmlInCanvasScreenshotService.waitForImage(image)
        )));
    }

    /**
     * Type guard for experimental 2D context.
     * @param ctx Canvas context
     * @returns True when context has drawElementImage
     */
    private static isHtmlInCanvasContext(
        ctx: CanvasRenderingContext2D | null,
    ): ctx is HtmlInCanvasRenderingContext2D {
        return !!ctx && typeof (
            ctx as Partial<HtmlInCanvasRenderingContext2D>
        ).drawElementImage === 'function';
    }

    /**
     * Request an image data URL from the background service worker.
     * @param url Image URL
     * @returns Data URL or null when unavailable
     */
    private static async fetchImageAsDataUrl(
        url: string,
    ): Promise<string | null> {
        const response: unknown = await chrome.runtime.sendMessage({
            action: ACTIONS.FETCH_IMAGE_AS_DATA_URL,
            pageUrl: window.location.href,
            url,
        });

        if (
            HtmlInCanvasScreenshotService.isImageDataUrlMessageResponse(
                response,
            )
            && response.success
            && response.dataUrl
        ) {
            return response.dataUrl;
        }

        return null;
    }

    /**
     * Check whether a runtime response contains an image data URL.
     * @param response Runtime response
     * @returns True when response matches image data URL response shape
     */
    private static isImageDataUrlMessageResponse(
        response: unknown,
    ): response is ImageDataUrlMessageResponse {
        return typeof response === 'object' && response !== null;
    }

    /**
     * Collect an element if it is an image plus descendant images.
     * @param element Root element
     * @returns Image elements in DOM order
     */
    private static getImageElements(element: Element): HTMLImageElement[] {
        const images: HTMLImageElement[] = [];
        if (
            element.tagName.toLowerCase()
                === HTML_IN_CANVAS_CONFIG.IMAGE_TAG_NAME
        ) {
            images.push(element as HTMLImageElement);
        }

        images.push(...Array.from(
            element.querySelectorAll(HTML_IN_CANVAS_CONFIG.IMAGE_SELECTOR),
        ));
        return images;
    }

    /**
     * Wait for a clone image to be ready before painting.
     * @param image Image element
     * @returns Promise resolved when loading completes or fails
     */
    private static async waitForImage(
        image: HTMLImageElement,
    ): Promise<void> {
        if (
            image.complete
            && image.naturalWidth > 0
            && image.naturalHeight > 0
        ) {
            return;
        }

        if (typeof image.decode === 'function') {
            try {
                await image.decode();
                return;
            } catch (error) {
                logger.debug(`Image decode failed before capture: ${error}`);
            }
        }

        await new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
        });
    }

    /**
     * Wait for the canvas paint event to record an initial layout snapshot.
     * @param canvas Staging canvas
     * @returns Promise resolved after paint
     * @throws {Error} When paint does not fire in time
     */
    private static waitForPaint(canvas: HtmlInCanvasElement): Promise<void> {
        return new Promise((resolve, reject) => {
            const paintCanvas = canvas;
            const timeoutId = globalThis.setTimeout(() => {
                paintCanvas.onpaint = null;
                reject(new Error(HTML_IN_CANVAS_ERROR.PAINT_TIMEOUT));
            }, HTML_IN_CANVAS_CONFIG.PAINT_TIMEOUT_MS);

            paintCanvas.onpaint = () => {
                globalThis.clearTimeout(timeoutId);
                paintCanvas.onpaint = null;
                resolve();
            };

            paintCanvas.requestPaint();
        });
    }

    /**
     * Draw a source element into the staging canvas using the prior paint snapshot.
     * @param canvas Staging canvas
     * @param source Direct canvas child to draw
     * @returns PNG data URL
     * @throws {Error} When the context is unavailable or output is empty
     */
    private static drawSource(
        canvas: HtmlInCanvasElement,
        source: HTMLElement,
    ): string {
        const ctx = canvas.getContext(
            HTML_IN_CANVAS_CONFIG.CONTEXT_TYPE,
            { willReadFrequently: true },
        );
        if (!HtmlInCanvasScreenshotService.isHtmlInCanvasContext(ctx)) {
            throw new Error(HTML_IN_CANVAS_ERROR.API_UNAVAILABLE);
        }

        HtmlInCanvasScreenshotService.resetCanvasContext(ctx, canvas);
        const transform = ctx.drawElementImage(
            source,
            0,
            0,
            canvas.width,
            canvas.height,
        );
        const sourceStyle = source.style;
        sourceStyle.transform = transform.toString();

        if (HtmlInCanvasScreenshotService.isCanvasEmpty(ctx, canvas)) {
            throw new Error(HTML_IN_CANVAS_ERROR_MESSAGE.EMPTY_CAPTURE);
        }

        logger.debug('HTML-in-Canvas capture completed');
        return canvas.toDataURL(HTML_IN_CANVAS_CONFIG.IMAGE_FORMAT);
    }

    /**
     * Reset a canvas context across stable and experimental browser builds.
     * @param ctx Canvas context
     * @param canvas Canvas whose bitmap should be cleared
     */
    private static resetCanvasContext(
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
    ): void {
        if (typeof ctx.reset === 'function') {
            ctx.reset();
            return;
        }

        ctx.setTransform(
            CANVAS_IDENTITY_SCALE,
            CANVAS_IDENTITY_SKEW,
            CANVAS_IDENTITY_SKEW,
            CANVAS_IDENTITY_SCALE,
            CANVAS_ORIGIN,
            CANVAS_ORIGIN,
        );
        ctx.clearRect(
            CANVAS_ORIGIN,
            CANVAS_ORIGIN,
            canvas.width,
            canvas.height,
        );
    }

    /**
     * Detect fully transparent captures before sending them to vision analysis.
     * @param ctx Canvas context
     * @param canvas Staging canvas
     * @returns True when sampled pixels contain no visible alpha
     */
    private static isCanvasEmpty(
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
    ): boolean {
        try {
            if (canvas.width <= 0 || canvas.height <= 0) {
                return true;
            }

            const sampleColumns = Math.min(
                canvas.width,
                HTML_IN_CANVAS_CONFIG.EMPTY_IMAGE_SAMPLE_GRID_SIZE,
            );
            const sampleRows = Math.min(
                canvas.height,
                HTML_IN_CANVAS_CONFIG.EMPTY_IMAGE_SAMPLE_GRID_SIZE,
            );

            for (let row = 0; row < sampleRows; row += 1) {
                for (let column = 0; column < sampleColumns; column += 1) {
                    const x = HtmlInCanvasScreenshotService
                        .getSampleCoordinate(
                            column,
                            sampleColumns,
                            canvas.width,
                        );
                    const y = HtmlInCanvasScreenshotService
                        .getSampleCoordinate(row, sampleRows, canvas.height);
                    const pixel = ctx.getImageData(
                        x,
                        y,
                        IMAGE_DATA_SAMPLE_SIZE,
                        IMAGE_DATA_SAMPLE_SIZE,
                    ).data;

                    if (
                        (pixel[HTML_IN_CANVAS_CONFIG.ALPHA_CHANNEL_OFFSET] ?? 0)
                            > 0
                    ) {
                        return false;
                    }
                }
            }

            return true;
        } catch (error) {
            logger.debug(`Could not inspect HTML-in-Canvas pixels: ${error}`);
            return false;
        }
    }

    /**
     * Get a sampled coordinate distributed across a canvas axis.
     * @param index Sample index
     * @param sampleCount Number of samples on this axis
     * @param size Canvas axis size
     * @returns Pixel coordinate
     */
    private static getSampleCoordinate(
        index: number,
        sampleCount: number,
        size: number,
    ): number {
        if (sampleCount <= 1) {
            return CANVAS_ORIGIN;
        }

        return Math.floor((index * (size - 1)) / (sampleCount - 1));
    }
}
