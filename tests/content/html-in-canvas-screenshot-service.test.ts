import { afterEach, describe, expect, it, vi } from 'vitest';
import { HTML_IN_CANVAS_ERROR } from '../../src/content/content-constants';
import { HtmlInCanvasScreenshotService } from '../../src/content/html-in-canvas-screenshot-service';

const TEST_INVALID_RECT = {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
};
const TEST_IMAGE_URL = 'file:///tmp/ad.png';
const TEST_IMAGE_DATA_URL = 'data:image/png;base64,YWQ=';

interface TestImageElement {
    currentSrc: string;
    removeAttribute: (name: string) => void;
    src: string;
    tagName: string;
    querySelectorAll: () => TestImageElement[];
}

function createTestImageElement(src: string): TestImageElement {
    return {
        currentSrc: src,
        removeAttribute: vi.fn(),
        src,
        tagName: 'IMG',
        querySelectorAll: () => [],
    };
}

describe('HtmlInCanvasScreenshotService', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should report unsupported when canvas APIs are missing', () => {
        vi.stubGlobal('HTMLCanvasElement', undefined);
        vi.stubGlobal('CanvasRenderingContext2D', undefined);

        expect(HtmlInCanvasScreenshotService.getCapability()).toEqual({
            supported: false,
            reason: HTML_IN_CANVAS_ERROR.API_UNAVAILABLE,
        });
    });

    it('should report supported when required APIs exist', () => {
        class TestCanvasElement {
            requestPaint(): void {}
        }
        Object.defineProperty(TestCanvasElement.prototype, 'onpaint', {
            value: null,
        });
        Object.defineProperty(TestCanvasElement.prototype, 'layoutSubtree', {
            value: false,
        });
        class TestCanvasContext {
            drawElementImage(): DOMMatrix {
                return new DOMMatrix();
            }
        }

        vi.stubGlobal('HTMLCanvasElement', TestCanvasElement);
        vi.stubGlobal('CanvasRenderingContext2D', TestCanvasContext);

        expect(HtmlInCanvasScreenshotService.getCapability()).toEqual({
            supported: true,
            reason: '',
        });
    });

    it('should report unsupported when paint events are missing', () => {
        class TestCanvasElement {
            requestPaint(): void {}
        }
        Object.defineProperty(TestCanvasElement.prototype, 'layoutSubtree', {
            value: false,
        });
        class TestCanvasContext {
            drawElementImage(): DOMMatrix {
                return new DOMMatrix();
            }
        }

        vi.stubGlobal('HTMLCanvasElement', TestCanvasElement);
        vi.stubGlobal('CanvasRenderingContext2D', TestCanvasContext);

        expect(HtmlInCanvasScreenshotService.getCapability()).toEqual({
            supported: false,
            reason: HTML_IN_CANVAS_ERROR.API_UNAVAILABLE,
        });
    });

    it('should reject invalid element dimensions', () => {
        const element = {
            getBoundingClientRect: () => TEST_INVALID_RECT,
        } as unknown as Element;

        expect(() => {
            HtmlInCanvasScreenshotService.getCaptureSize(element);
        }).toThrow('Invalid screenshot target dimensions');
    });

    it('should request data URLs for cloned image elements', async () => {
        const source = createTestImageElement(TEST_IMAGE_URL);
        const clone = createTestImageElement(TEST_IMAGE_URL);
        const fetchImageAsDataUrl = vi.fn(async () => TEST_IMAGE_DATA_URL);

        await HtmlInCanvasScreenshotService.inlineImageResources(
            source as unknown as Element,
            clone as unknown as HTMLElement,
            fetchImageAsDataUrl,
        );

        expect(fetchImageAsDataUrl).toHaveBeenCalledWith(source.currentSrc);
        expect(clone.src).toBe(TEST_IMAGE_DATA_URL);
    });

    it('should reject when an image resource cannot be inlined', async () => {
        const source = createTestImageElement(TEST_IMAGE_URL);
        const clone = createTestImageElement(TEST_IMAGE_URL);
        const fetchImageAsDataUrl = vi.fn(async () => null);

        await expect(HtmlInCanvasScreenshotService.inlineImageResources(
            source as unknown as Element,
            clone as unknown as HTMLElement,
            fetchImageAsDataUrl,
        )).rejects.toThrow('Image resource could not be inlined');
    });
});
