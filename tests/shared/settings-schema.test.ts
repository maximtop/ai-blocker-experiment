import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PROMPT_MODEL,
    DEFAULT_USE_HTML_IN_CANVAS_SCREENSHOTS,
    DEFAULT_VISION_MODEL,
    getModelId,
    LLM_PROVIDERS,
} from '../../src/shared/constants';
import { DEFAULT_SETTINGS, parseSettings } from '../../src/shared/settings-schema';

const LEGACY_GPT_5_NANO = 'gpt-5-nano';
const LEGACY_GPT_5_MINI = 'gpt-5-mini';

describe('settingsSchema', () => {
    it('should default HTML-in-Canvas screenshots to enabled', () => {
        const settings = parseSettings({});

        expect(settings.useHtmlInCanvasScreenshots).toBe(true);
        expect(DEFAULT_SETTINGS.useHtmlInCanvasScreenshots).toBe(true);
        expect(DEFAULT_USE_HTML_IN_CANVAS_SCREENSHOTS).toBe(true);
    });

    it('should preserve explicit HTML-in-Canvas screenshot opt-out', () => {
        const settings = parseSettings({
            useHtmlInCanvasScreenshots: false,
        });

        expect(settings.useHtmlInCanvasScreenshots).toBe(false);
    });

    it('should migrate legacy GPT-5 model settings', () => {
        const settings = parseSettings({
            promptModel: getModelId(LEGACY_GPT_5_NANO, LLM_PROVIDERS.OPENAI),
            visionModel: getModelId(LEGACY_GPT_5_MINI, LLM_PROVIDERS.OPENAI),
        });

        expect(settings.promptModel).toBe(DEFAULT_PROMPT_MODEL);
        expect(settings.visionModel).toBe(DEFAULT_VISION_MODEL);
    });
});
