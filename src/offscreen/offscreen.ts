import { ACTIONS, PORT_NAMES } from '../shared/constants';
import type {
    OffscreenRequest,
    OffscreenResponseFor,
} from '../shared/offscreen-messages';

/**
 * OffscreenManager handles image manipulation in offscreen document context
 * Service workers don't have access to DOM APIs like Image and Canvas
 */
export class OffscreenManager {
    /**
     * Initialize the offscreen manager and set up message listeners
     */
    static init(): void {
        OffscreenManager.setupMessageListener();
    }

    /**
     * Set up long-living port connection for crop requests
     */
    static setupMessageListener(): void {
        chrome.runtime.onConnect.addListener((port) => {
            if (port.name !== PORT_NAMES.OFFSCREEN_CROP) {
                return;
            }

            port.onMessage.addListener((message: OffscreenRequest) => {
                OffscreenManager.handleCropMessage(port, message);
            });
        });
    }

    /**
     * Handle crop image message
     * @param port Chrome runtime port
     * @param message Message with action, dataUrl, bounds, requestId
     */
    static async handleCropMessage(
        port: chrome.runtime.Port,
        message: OffscreenRequest,
    ): Promise<void> {
        if (message.action !== ACTIONS.CROP_IMAGE) {
            return;
        }

        try {
            const croppedDataUrl = await OffscreenManager.cropImage(
                message.dataUrl,
                message.bounds,
            );
            const response: OffscreenResponseFor<
                typeof ACTIONS.CROP_IMAGE
            > = {
                success: true,
                dataUrl: croppedDataUrl,
                requestId: message.requestId,
            };
            port.postMessage(response);
        } catch (error) {
            const errorResponse: OffscreenResponseFor<
                typeof ACTIONS.CROP_IMAGE
            > = {
                success: false,
                error: (error as Error).message,
                requestId: message.requestId,
            };
            port.postMessage(errorResponse);
        }
    }

    /**
     * Crop image data URL to specified bounds
     * @param dataUrl Original screenshot data URL
     * @param bounds Cropping bounds {x, y, width, height}
     * @param bounds.x The x-coordinate of the crop area's top-left corner
     * @param bounds.y The y-coordinate of the crop area's top-left corner
     * @param bounds.width The width of the crop area in pixels
     * @param bounds.height The height of the crop area in pixels
     * @returns Cropped image data URL
     */
    static cropImage(
        dataUrl: string,
        bounds: { x: number; y: number; width: number; height: number },
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = bounds.width;
                    canvas.height = bounds.height;
                    const ctx = canvas.getContext('2d');

                    if (!ctx) {
                        reject(new Error('Failed to get canvas context'));
                        return;
                    }

                    // Draw cropped portion
                    ctx.drawImage(
                        img,
                        bounds.x,
                        bounds.y,
                        bounds.width,
                        bounds.height,
                        0,
                        0,
                        bounds.width,
                        bounds.height,
                    );

                    // Convert to data URL
                    const croppedDataUrl = canvas.toDataURL('image/png');
                    resolve(croppedDataUrl);
                } catch (error) {
                    reject(error);
                }
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = dataUrl;
        });
    }
}
