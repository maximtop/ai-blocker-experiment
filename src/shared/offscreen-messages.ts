// Offscreen document port message types
// Used for long-living port connections between background and offscreen document

import { ACTIONS } from './constants';

/**
 * Cropping bounds for image manipulation
 */
export interface CropBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Offscreen message map - couples request structure with response type
 * This follows the same pattern as MessageMap in message-handler.ts
 */
export type OffscreenMessageMap = {
    [ACTIONS.CROP_IMAGE]: {
        request: {
            action: typeof ACTIONS.CROP_IMAGE;
            dataUrl: string;
            bounds: CropBounds;
            requestId: string;
        };
        response: {
            success: true;
            dataUrl: string;
            requestId: string;
        } | {
            success: false;
            error: string;
            requestId: string;
        };
    };
};

/**
 * Union of all valid offscreen action types
 */
export type OffscreenAction = keyof OffscreenMessageMap;

/**
 * Union of all offscreen request message types
 */
export type OffscreenRequest = OffscreenMessageMap[OffscreenAction]['request'];

/**
 * Union of all offscreen response message types
 */
export type OffscreenResponse = OffscreenMessageMap[OffscreenAction]['response'];

/**
 * Type helper to get request type for a specific action
 */
export type OffscreenRequestFor<A extends OffscreenAction> =
    OffscreenMessageMap[A]['request'];

/**
 * Type helper to get response type for a specific action
 */
export type OffscreenResponseFor<A extends OffscreenAction> =
    OffscreenMessageMap[A]['response'];
