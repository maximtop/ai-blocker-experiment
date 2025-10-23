// Screenshot service for capturing page screenshots

import { format } from 'date-fns';

import {
    ACTIONS,
    PORT_NAMES,
    SCREENSHOT_CONFIG,
    SETTINGS_KEYS,
} from '../shared/constants';
import { createLogger } from '../shared/logger';
import type {
    CropBounds,
    OffscreenRequestFor,
    OffscreenResponse,
} from '../shared/offscreen-messages';
import { SettingsManager } from '../shared/settings';

const logger = createLogger('ScreenshotService');

/**
 * Screenshot capture result
 */
interface CaptureResult {
    success: boolean;
    downloadId: number | null;
    filename: string;
    dataUrl: string;
    criteria?: string;
    visionAnalysis?: unknown;
    error?: string;
}

/**
 * Download result
 */
interface DownloadResult {
    success: boolean;
    downloadId: number;
    filename: string;
    error?: string;
}

/**
 * ScreenshotService handles screenshot capture and download operations
 */
export class ScreenshotService {
    /**
     * Promise lock to prevent race conditions when creating offscreen doc.
     * @type {Promise<void>|null}
     */
    static offscreenCreating: Promise<void> | null = null;

    /**
     * Singleton port connection to the offscreen document for image cropping.
     * @type {chrome.runtime.Port|null}
     */
    static offscreenPort: chrome.runtime.Port | null = null;

    /**
     * Pending crop requests mapped by requestId to Promise callbacks.
     * @type {Map<string, {resolve: (value: string) => void,
     * reject: (reason: Error) => void}>}
     */
    static pendingRequests = new Map();

    /**
     * Capture a screenshot of the current active tab
     * @param {number} tabId Tab ID to capture
     * @returns {Promise<string>} Data URL of the captured screenshot
     */
    static async captureTab(tabId: number): Promise<string> {
        try {
            logger.info(`Capturing screenshot for tab ${tabId}`);

            const imgFormat = SCREENSHOT_CONFIG.FORMAT as 'jpeg' | 'png';
            const dataUrl: string = await chrome.tabs.captureVisibleTab({
                format: imgFormat,
                quality: SCREENSHOT_CONFIG.QUALITY,
            });

            logger.info('Screenshot captured successfully');
            return dataUrl;
        } catch (error) {
            logger.error('Failed to capture screenshot:', error);
            throw error;
        }
    }

    /**
     * Save screenshot to downloads directory
     * @param dataUrl Data URL of the screenshot
     * @param filename Filename for the download
     * @returns Download ID
     */
    static async saveToDownloads(
        dataUrl: string,
        filename: string,
    ): Promise<number> {
        try {
            logger.info(`Saving screenshot as ${filename}`);

            const downloadId = await chrome.downloads.download({
                url: dataUrl,
                filename,
                saveAs: false,
                conflictAction: 'uniquify',
            });

            logger.info(`Screenshot saved with download ID: ${downloadId}`);
            return downloadId;
        } catch (error) {
            logger.error('Failed to save screenshot:', error);
            throw error;
        }
    }

    /**
     * Generate filename for screenshot
     * @returns Generated filename with timestamp
     */
    static generateFilename(): string {
        const timestamp = format(new Date(), 'yyyy-MM-dd-HH-mm-ss-SSS');
        // eslint-disable-next-line max-len
        return `${SCREENSHOT_CONFIG.FILENAME_PREFIX}_${timestamp}.${SCREENSHOT_CONFIG.FORMAT}`;
    }

    /**
     * Ensure offscreen document exists for image manipulation
     * @returns {Promise<void>}
     */
    static async ensureOffscreenDocument() {
        // If already creating, wait for it
        if (ScreenshotService.offscreenCreating) {
            await ScreenshotService.offscreenCreating;
            return;
        }

        // Check if document already exists
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
        });

        if (existingContexts.length > 0) {
            return;
        }

        // Double-check lock pattern: check again after async operation
        if (ScreenshotService.offscreenCreating) {
            await ScreenshotService.offscreenCreating;
            return;
        }

        // Set the lock
        ScreenshotService.offscreenCreating = chrome.offscreen.createDocument({
            url: 'offscreen/offscreen.html',
            reasons: ['DOM_SCRAPING'],
            justification: 'Image manipulation for screenshot cropping',
        });

        try {
            await ScreenshotService.offscreenCreating;
        } finally {
            ScreenshotService.offscreenCreating = null;
        }
    }

    /**
     * Connect to offscreen document port
     * @returns {Promise<void>}
     */
    static async connectToOffscreen() {
        if (ScreenshotService.offscreenPort) {
            return;
        }

        await ScreenshotService.ensureOffscreenDocument();

        ScreenshotService.offscreenPort = chrome.runtime.connect({
            name: PORT_NAMES.OFFSCREEN_CROP,
        });

        ScreenshotService.offscreenPort.onMessage.addListener(
            (response: OffscreenResponse) => {
                const request = ScreenshotService.pendingRequests.get(
                    response.requestId,
                );
                if (request) {
                    ScreenshotService.pendingRequests.delete(
                        response.requestId,
                    );
                    if (response.success) {
                        request.resolve(response.dataUrl);
                    } else {
                        request.reject(new Error(response.error));
                    }
                }
            },
        );

        ScreenshotService.offscreenPort!.onDisconnect.addListener(() => {
            logger.info('Offscreen port disconnected');
            ScreenshotService.offscreenPort = null;
            // Reject all pending requests
            ScreenshotService.pendingRequests.forEach((request) => {
                request.reject(new Error('Port disconnected'));
            });
            ScreenshotService.pendingRequests.clear();
        });
    }

    /**
     * Crop image data URL to specified bounds using offscreen document
     * @param dataUrl Original screenshot data URL
     * @param bounds Cropping bounds
     * @returns Cropped image data URL
     */
    static async cropImage(
        dataUrl: string,
        bounds: CropBounds,
    ): Promise<string> {
        await ScreenshotService.connectToOffscreen();

        const requestId = `crop-${Date.now()}-${Math.random()}`;

        return new Promise((resolve, reject) => {
            ScreenshotService.pendingRequests.set(requestId, {
                resolve,
                reject,
            });

            const request: OffscreenRequestFor<typeof ACTIONS.CROP_IMAGE> = {
                action: ACTIONS.CROP_IMAGE,
                dataUrl,
                bounds,
                requestId,
            };
            ScreenshotService.offscreenPort!.postMessage(request);
        });
    }

    /**
     * Capture and save screenshot of the active tab
     * @param tabId Tab ID to capture
     * @param bounds Optional bounds for cropping
     * @param criteria Optional vision criteria for analysis
     * @param onCaptured Optional callback after screenshot is captured (before save)
     * @returns Result with downloadId, filename, dataUrl, and criteria
     */
    static async captureAndSave(
        tabId: number,
        bounds: CropBounds | null,
        criteria: string,
        onCaptured?: (filename: string) => void,
    ): Promise<CaptureResult> {
        try {
            let dataUrl = await ScreenshotService.captureTab(tabId);

            // Generate filename and notify IMMEDIATELY after capture
            // Cropping doesn't need the page visible, so blur can happen now
            const filename = ScreenshotService.generateFilename();

            // Call the callback now that screenshot is captured
            // This allows blurring to happen while cropping/saving continues
            if (onCaptured) {
                onCaptured(filename);
            }

            // Crop if bounds provided (can happen after blur is applied)
            if (bounds) {
                logger.info('Cropping screenshot to bounds');
                dataUrl = await ScreenshotService.cropImage(dataUrl, bounds);
            }

            let downloadId = null;

            // Check if screenshot downloads are enabled
            const shouldSave = await SettingsManager.get(
                SETTINGS_KEYS.SAVE_SCREENSHOTS_TO_DOWNLOADS,
            );

            logger.info(
                `Screenshot download setting: ${shouldSave} `
                + `(key: ${SETTINGS_KEYS.SAVE_SCREENSHOTS_TO_DOWNLOADS})`,
            );

            if (shouldSave) {
                downloadId = await ScreenshotService.saveToDownloads(
                    dataUrl,
                    filename,
                );
                logger.info(`Screenshot saved to downloads with ID: ${downloadId}`);
            } else {
                const msg = 'Screenshot captured but not saved '
                    + '(disabled in settings)';
                logger.info(msg);
            }

            return {
                success: true,
                downloadId,
                filename,
                dataUrl,
                criteria,
            };
        } catch (error) {
            logger.error('Failed to capture and save screenshot:', error);
            return {
                success: false,
                downloadId: null,
                filename: '',
                dataUrl: '',
                error: (error as Error).message,
            };
        }
    }

    /**
     * Download canvas image from data URL
     * @param dataUrl Canvas data URL
     * @returns Result with downloadId and filename
     */
    static async downloadFromDataUrl(
        dataUrl: string,
    ): Promise<DownloadResult> {
        try {
            const filename = ScreenshotService.generateFilename();
            const downloadId = await ScreenshotService.saveToDownloads(
                dataUrl,
                filename,
            );

            return {
                success: true,
                downloadId,
                filename,
            };
        } catch (error) {
            logger.error('Failed to download canvas image:', error);
            return {
                success: false,
                downloadId: 0,
                filename: '',
                error: (error as Error).message,
            };
        }
    }
}
