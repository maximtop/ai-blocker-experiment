import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Options } from '../../src/options/options';

const OPTIONS_HTML = readFileSync('src/options/options.html', 'utf8');
const OLD_HTML_IN_CANVAS_LABEL = [
    'Use experimental',
    'HTML-in-Canvas screenshots',
].join(' ');
const TEST_DEBUG_LOGGING_ENABLED = false;
const TEST_HTML_IN_CANVAS_ENABLED = true;
const TEST_SAVE_SCREENSHOTS_ENABLED = true;

describe('Options', () => {
    it('should build development settings with screenshot flags', () => {
        const settings = Options.buildDevelopmentSettings({
            debugLogging: TEST_DEBUG_LOGGING_ENABLED,
            saveScreenshotsToDownloads: TEST_SAVE_SCREENSHOTS_ENABLED,
            useHtmlInCanvasScreenshots: TEST_HTML_IN_CANVAS_ENABLED,
        });

        expect(settings).toEqual({
            debugLogging: TEST_DEBUG_LOGGING_ENABLED,
            saveScreenshotsToDownloads: TEST_SAVE_SCREENSHOTS_ENABLED,
            useHtmlInCanvasScreenshots: TEST_HTML_IN_CANVAS_ENABLED,
        });
    });

    it('should describe HTML-in-Canvas as the primary screenshot path', () => {
        expect(OPTIONS_HTML).toContain(
            'Use HTML-in-Canvas element screenshots',
        );
        expect(OPTIONS_HTML).toContain(
            'Primary screenshot path for visible and offscreen matches',
        );
        expect(OPTIONS_HTML).not.toContain(
            OLD_HTML_IN_CANVAS_LABEL,
        );
    });
});
