// Content script specific constants for DOM analysis

// Element size constants for content analysis
export const MIN_WIDTH = 100;
export const MIN_HEIGHT = 50;
export const MIN_TEXT_LENGTH = 1; // minimum one word

// Element size constants for blur overlay
export const MIN_BLUR_WIDTH = 30;
export const MIN_BLUR_HEIGHT = 15;

// Blur mode constants
export const BLUR_MODE = {
    ANALYZING: 'analyzing',
    BLOCKED: 'blocked',
    SAFE: 'safe',
};
