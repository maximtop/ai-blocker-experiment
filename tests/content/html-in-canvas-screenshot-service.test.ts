import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    HTML_IN_CANVAS_CONFIG,
    HTML_IN_CANVAS_ERROR,
    HTML_IN_CANVAS_ERROR_MESSAGE,
} from '../../src/content/content-constants';
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
const TEST_SCREENSHOT_DATA_URL = 'data:image/png;base64,c2NyZWVuc2hvdA==';
const TEST_CAPTURE_SIZE = 100;
const TEST_LARGE_CAPTURE_SIZE = 4096;
const TEST_TRANSLATE_TRANSFORM = 'matrix(1, 0, 0, 1, 10, 20)';

interface TestImageElement {
    currentSrc: string;
    removeAttribute: (name: string) => void;
    src: string;
    tagName: string;
    querySelectorAll: () => TestImageElement[];
}

interface TestElement {
    appendChild?: (child: unknown) => void;
    cloneNode: () => TestElement;
    getBoundingClientRect: () => typeof TEST_CAPTURE_RECT;
    querySelectorAll: () => TestElement[];
    remove?: () => void;
    setAttribute?: (name: string, value: string) => void;
    style: Record<string, string>;
    tagName: string;
    toDataURL?: (format: string) => string;
}

interface TestCanvasNode extends TestElement {
    getContext: () => Record<string, unknown>;
    height?: number;
    onpaint: (() => void) | null;
    requestPaint: () => void;
    width?: number;
}

const TEST_CAPTURE_RECT = {
    bottom: TEST_CAPTURE_SIZE,
    height: TEST_CAPTURE_SIZE,
    left: 0,
    right: TEST_CAPTURE_SIZE,
    top: 0,
    width: TEST_CAPTURE_SIZE,
    x: 0,
    y: 0,
    toJSON: () => ({}),
};

const TEST_LARGE_CAPTURE_RECT = {
    ...TEST_CAPTURE_RECT,
    bottom: TEST_LARGE_CAPTURE_SIZE,
    height: TEST_LARGE_CAPTURE_SIZE,
    right: TEST_LARGE_CAPTURE_SIZE,
    width: TEST_LARGE_CAPTURE_SIZE,
};

function createTestImageElement(src: string): TestImageElement {
    return {
        currentSrc: src,
        removeAttribute: vi.fn(),
        src,
        tagName: 'IMG',
        querySelectorAll: () => [],
    };
}

function createTransformStub(): Pick<DOMMatrix, 'toString'> {
    return {
        toString: () => TEST_TRANSLATE_TRANSFORM,
    };
}

function createCaptureElement(
    rect = TEST_CAPTURE_RECT,
): TestElement {
    const clone: TestElement = {
        cloneNode: () => clone,
        getBoundingClientRect: () => rect,
        querySelectorAll: () => [],
        setAttribute: vi.fn(),
        style: {},
        tagName: 'DIV',
    };

    return {
        cloneNode: () => clone,
        getBoundingClientRect: () => rect,
        querySelectorAll: () => [],
        style: {},
        tagName: 'DIV',
    };
}

function stubCaptureEnvironment(
    context: Record<string, unknown>,
): void {
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
        drawElementImage(): Pick<DOMMatrix, 'toString'> {
            return createTransformStub();
        }
    }

    vi.stubGlobal('HTMLCanvasElement', TestCanvasElement);
    vi.stubGlobal('CanvasRenderingContext2D', TestCanvasContext);
    vi.stubGlobal('devicePixelRatio', 1);
    vi.stubGlobal('getComputedStyle', () => ({
        getPropertyValue: () => '',
        [Symbol.iterator]: function* iterator() {},
    }));
    const createCanvasNode = (): TestCanvasNode => ({
        appendChild: vi.fn(),
        cloneNode: () => createCanvasNode(),
        getBoundingClientRect: () => TEST_CAPTURE_RECT,
        getContext: () => context,
        onpaint: null,
        querySelectorAll: () => [],
        remove: vi.fn(),
        requestPaint() {
            this.onpaint?.();
        },
        setAttribute: vi.fn(),
        style: {},
        tagName: 'CANVAS',
        toDataURL: () => TEST_SCREENSHOT_DATA_URL,
    });

    vi.stubGlobal('document', {
        body: {
            appendChild: vi.fn(),
        },
        createElement: () => createCanvasNode(),
    });
}

describe('HtmlInCanvasScreenshotService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
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
            drawElementImage(): Pick<DOMMatrix, 'toString'> {
                return createTransformStub();
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
            drawElementImage(): Pick<DOMMatrix, 'toString'> {
                return createTransformStub();
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

    it('should fall back when canvas context reset is unavailable', async () => {
        const context = {
            clearRect: vi.fn(),
            drawElementImage: vi.fn(() => createTransformStub()),
            getImageData: vi.fn(() => ({
                data: Uint8ClampedArray.from([0, 0, 0, 255]),
            })),
            setTransform: vi.fn(),
        };
        stubCaptureEnvironment(context);

        const result = await HtmlInCanvasScreenshotService.capture(
            createCaptureElement() as unknown as Element,
        );

        expect(result).toBe(TEST_SCREENSHOT_DATA_URL);
        expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
        expect(context.clearRect).toHaveBeenCalledWith(
            0,
            0,
            TEST_CAPTURE_SIZE,
            TEST_CAPTURE_SIZE,
        );
    });

    it('should sample a bounded pixel grid when checking empty captures', async () => {
        const context = {
            clearRect: vi.fn(),
            drawElementImage: vi.fn(() => createTransformStub()),
            getImageData: vi.fn(() => ({
                data: Uint8ClampedArray.from([0, 0, 0, 0]),
            })),
            reset: vi.fn(),
        };
        stubCaptureEnvironment(context);

        await expect(HtmlInCanvasScreenshotService.capture(
            createCaptureElement(TEST_LARGE_CAPTURE_RECT) as unknown as Element,
        )).rejects.toThrow(HTML_IN_CANVAS_ERROR_MESSAGE.EMPTY_CAPTURE);

        const expectedSampleCount = (
            HTML_IN_CANVAS_CONFIG.EMPTY_IMAGE_SAMPLE_GRID_SIZE
            * HTML_IN_CANVAS_CONFIG.EMPTY_IMAGE_SAMPLE_GRID_SIZE
        );
        expect(context.getImageData).toHaveBeenCalledTimes(expectedSampleCount);
        expect(context.getImageData).toHaveBeenCalledWith(
            0,
            0,
            1,
            1,
        );
        expect(context.getImageData).toHaveBeenLastCalledWith(
            TEST_LARGE_CAPTURE_SIZE - 1,
            TEST_LARGE_CAPTURE_SIZE - 1,
            1,
            1,
        );
    });
});
