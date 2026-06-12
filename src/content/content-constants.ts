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

// Experimental HTML-in-Canvas renderer configuration
export const HTML_IN_CANVAS_CONFIG = {
    ALPHA_CHANNEL_OFFSET: 3,
    BACKGROUND_POSITION_CENTER: 'center',
    BACKGROUND_REPEAT_NONE: 'no-repeat',
    BACKGROUND_SIZE_CONTAIN: 'contain',
    CAPTURE_IGNORE_ATTRIBUTE: 'data-ai-blocker-capture-ignore',
    CAPTURE_ROOT_DISPLAY: 'block',
    CAPTURE_ZERO_SIZE: '0',
    CONTEXT_TYPE: '2d',
    DATA_URL_PREFIX: 'data:',
    EMPTY_IMAGE_SAMPLE_GRID_SIZE: 32,
    IMAGE_FORMAT: 'image/png',
    IMAGE_SELECTOR: 'img',
    IMAGE_SIZES_ATTRIBUTE: 'sizes',
    IMAGE_SRCSET_ATTRIBUTE: 'srcset',
    IMAGE_TAG_NAME: 'img',
    LAYOUT_SUBTREE_ATTRIBUTE: 'layoutsubtree',
    MAX_DIMENSION: 4096,
    PAINT_TIMEOUT_MS: 1000,
    RGBA_CHANNEL_COUNT: 4,
    STAGING_CONTAIN: 'layout style paint',
    STAGING_LEFT: 0,
    STAGING_OVERFLOW: 'hidden',
    STAGING_POINTER_EVENTS: 'none',
    STAGING_POSITION: 'fixed',
    STAGING_TOP: '0',
    STAGING_Z_INDEX: '-2147483648',
} as const;

// Experimental HTML-in-Canvas error codes
export const HTML_IN_CANVAS_ERROR = {
    API_UNAVAILABLE: 'htmlInCanvasApiUnavailable',
    EMPTY_CAPTURE: 'emptyCapture',
    IMAGE_INLINE_FAILED: 'imageInlineFailed',
    INVALID_DIMENSIONS: 'invalidDimensions',
    PAINT_TIMEOUT: 'paintTimeout',
} as const;

// Experimental HTML-in-Canvas user-facing error messages
export const HTML_IN_CANVAS_ERROR_MESSAGE = {
    EMPTY_CAPTURE: 'HTML-in-Canvas capture produced an empty image',
    IMAGE_INLINE_FAILED: 'Image resource could not be inlined',
    INVALID_DIMENSIONS: 'Invalid screenshot target dimensions',
} as const;

// Vision result formatting values
export const VISION_RESULT_CONFIG = {
    DEFAULT_THRESHOLD: 0.7,
    PERCENT_MULTIPLIER: 100,
} as const;
