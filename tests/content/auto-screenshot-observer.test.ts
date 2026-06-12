import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutoScreenshotObserver } from '../../src/content/auto-screenshot-observer';
import { HTML_IN_CANVAS_CONFIG } from '../../src/content/content-constants';

const TEST_VIEWPORT_HEIGHT = 100;
const TEST_VIEWPORT_WIDTH = 100;

const TEST_VISIBLE_RECT = {
    bottom: 80,
    height: 60,
    left: 10,
    right: 90,
    top: 20,
    width: 80,
    x: 10,
    y: 20,
    toJSON: () => ({}),
};

const TEST_OFFSCREEN_RECT = {
    bottom: 240,
    height: 80,
    left: 10,
    right: 90,
    top: 160,
    width: 80,
    x: 10,
    y: 160,
    toJSON: () => ({}),
};

const TEST_INTERNAL_SELECTOR = (
    `[${HTML_IN_CANVAS_CONFIG.CAPTURE_IGNORE_ATTRIBUTE}]`
);

describe('AutoScreenshotObserver', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should identify visible elements for visible-tab fallback', () => {
        vi.stubGlobal('window', {
            innerHeight: TEST_VIEWPORT_HEIGHT,
            innerWidth: TEST_VIEWPORT_WIDTH,
        });

        const element = {
            getBoundingClientRect: () => TEST_VISIBLE_RECT,
        } as unknown as Element;

        expect(AutoScreenshotObserver.isElementFullyInViewport(element))
            .toBe(true);
    });

    it('should identify offscreen elements so visible-tab fallback is blocked', () => {
        vi.stubGlobal('window', {
            innerHeight: TEST_VIEWPORT_HEIGHT,
            innerWidth: TEST_VIEWPORT_WIDTH,
        });

        const element = {
            getBoundingClientRect: () => TEST_OFFSCREEN_RECT,
        } as unknown as Element;

        expect(AutoScreenshotObserver.isElementFullyInViewport(element))
            .toBe(false);
    });

    it('should identify internal screenshot staging elements', () => {
        const element = {
            closest: (selector: string) => (
                selector === TEST_INTERNAL_SELECTOR ? {} : null
            ),
        } as unknown as Element;

        expect(AutoScreenshotObserver.isIgnoredCaptureElement(element))
            .toBe(true);
    });

    it('should allow normal page elements through screenshot observation', () => {
        const element = {
            closest: () => null,
        } as unknown as Element;

        expect(AutoScreenshotObserver.isIgnoredCaptureElement(element))
            .toBe(false);
    });

    it('should not use visible-tab fallback when primary capture fails', async () => {
        vi.stubGlobal('window', {
            innerHeight: TEST_VIEWPORT_HEIGHT,
            innerWidth: TEST_VIEWPORT_WIDTH,
            scrollY: 0,
        });

        const observer = new AutoScreenshotObserver();
        const element = {
            getBoundingClientRect: () => TEST_VISIBLE_RECT,
        } as unknown as Element;
        const fallbackSpy = vi.spyOn(observer, 'handleElementFullyVisible');

        await observer.handleHtmlInCanvasFailure(
            element,
            new Error('HTML-in-Canvas API unavailable'),
        );

        expect(fallbackSpy).not.toHaveBeenCalled();
    });
});
