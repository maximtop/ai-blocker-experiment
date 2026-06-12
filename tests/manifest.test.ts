import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MINIMUM_HTML_IN_CANVAS_CHROME_VERSION = '149';

function isManifest(value: unknown): value is {
    minimum_chrome_version?: unknown;
} {
    return typeof value === 'object' && value !== null;
}

describe('manifest', () => {
    it('should require a Chrome version that can expose HTML-in-Canvas', () => {
        const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

        expect(isManifest(manifest)).toBe(true);
        if (!isManifest(manifest)) {
            return;
        }

        expect(manifest.minimum_chrome_version).toBe(
            MINIMUM_HTML_IN_CANVAS_CHROME_VERSION,
        );
    });
});
