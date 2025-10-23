/* eslint-disable no-console */

/**
 * Extract error message from unknown error type
 * @param error Unknown error object
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

/**
 * Logger instance interface
 */
export interface Logger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string, error?: unknown): void;
    debug(message: string): void;
}

/**
 * Core logger interface with context parameter
 */
export interface CoreLogger {
    info(context: string, message: string): void;
    warn(context: string, message: string): void;
    error(context: string, message: string, error?: unknown): void;
    debug(context: string, message: string): void;
}

/**
 * Create a contextual logger instance with preset context
 * @param context The context name to use for all log messages
 * @returns Logger instance with context preset
 */
export function createLogger(context: string): Logger {
    return {
        info: (message: string): void => {
            console.log(`[${context}] ${message}`);
        },
        warn: (message: string): void => {
            console.warn(`[${context}] ${message}`);
        },
        error: (message: string, error: unknown = null): void => {
            if (error) {
                console.error(`[${context}] ${message}`, error);
            } else {
                console.error(`[${context}] ${message}`);
            }
        },
        debug: (message: string): void => {
            console.log(`[${context}] 🔍 ${message}`);
        },
    };
}

// FIXME remove
/**
 * Default logger instance for global use
 */
export const logger: CoreLogger = {
    info: (context: string, message: string): void => {
        console.log(`[${context}] ${message}`);
    },
    warn: (context: string, message: string): void => {
        console.warn(`[${context}] ${message}`);
    },
    error: (context: string, message: string, error: unknown = null): void => {
        if (error) {
            console.error(`[${context}] ${message}`, error);
        } else {
            console.error(`[${context}] ${message}`);
        }
    },
    debug: (context: string, message: string): void => {
        console.log(`[${context}] 🔍 ${message}`);
    },
};
