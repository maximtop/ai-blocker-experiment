import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCREENSHOT_CAPTURE_PATH, SETTINGS_KEYS } from '../../src/shared/constants';
import { SettingsManager } from '../../src/shared/settings';
import { ScreenshotService } from '../../src/background/screenshot-service';

const TEST_DOWNLOAD_ID = 123;
const TEST_SCREENSHOT_CRITERIA = 'ad criteria';
const TEST_SCREENSHOT_DATA_URL = 'data:image/png;base64,abc';
const TEST_SCREENSHOT_FILENAME = 'screenshot-test.png';

const settingsMocks = vi.hoisted(() => ({
    get: vi.fn<(key: string) => Promise<boolean>>(),
}));

vi.mock('../../src/shared/settings', () => ({
    SettingsManager: {
        get: settingsMocks.get,
    },
}));

describe('ScreenshotService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        settingsMocks.get.mockReset();
        settingsMocks.get.mockResolvedValue(false);
        vi.spyOn(ScreenshotService, 'generateFilename')
            .mockReturnValue(TEST_SCREENSHOT_FILENAME);
        vi.spyOn(ScreenshotService, 'saveToDownloads')
            .mockResolvedValue(TEST_DOWNLOAD_ID);
    });

    it('should wrap a pre-rendered data URL for vision analysis', async () => {
        const result = await ScreenshotService.createFromDataUrl(
            TEST_SCREENSHOT_DATA_URL,
            TEST_SCREENSHOT_CRITERIA,
            SCREENSHOT_CAPTURE_PATH.HTML_IN_CANVAS,
            undefined,
        );

        expect(result).toEqual({
            success: true,
            capturePath: SCREENSHOT_CAPTURE_PATH.HTML_IN_CANVAS,
            criteria: TEST_SCREENSHOT_CRITERIA,
            dataUrl: TEST_SCREENSHOT_DATA_URL,
            downloadId: null,
            filename: TEST_SCREENSHOT_FILENAME,
        });
        expect(SettingsManager.get).toHaveBeenCalledWith(
            SETTINGS_KEYS.SAVE_SCREENSHOTS_TO_DOWNLOADS,
        );
        expect(ScreenshotService.saveToDownloads).not.toHaveBeenCalled();
    });

    it('should save pre-rendered screenshots when downloads are enabled', async () => {
        settingsMocks.get.mockResolvedValue(true);

        const result = await ScreenshotService.createFromDataUrl(
            TEST_SCREENSHOT_DATA_URL,
            TEST_SCREENSHOT_CRITERIA,
            SCREENSHOT_CAPTURE_PATH.HTML_IN_CANVAS,
            undefined,
        );

        expect(result.downloadId).toBe(TEST_DOWNLOAD_ID);
        expect(ScreenshotService.saveToDownloads).toHaveBeenCalledWith(
            TEST_SCREENSHOT_DATA_URL,
            TEST_SCREENSHOT_FILENAME,
        );
    });

    it('should notify when pre-rendered screenshot is accepted', async () => {
        const onCaptured = vi.fn();

        const result = await ScreenshotService.createFromDataUrl(
            TEST_SCREENSHOT_DATA_URL,
            TEST_SCREENSHOT_CRITERIA,
            SCREENSHOT_CAPTURE_PATH.HTML_IN_CANVAS,
            onCaptured,
        );

        expect(onCaptured).toHaveBeenCalledWith(TEST_SCREENSHOT_FILENAME);
        expect(result.capturePath).toBe(SCREENSHOT_CAPTURE_PATH.HTML_IN_CANVAS);
    });
});
