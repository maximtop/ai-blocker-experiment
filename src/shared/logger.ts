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
    setEnabled(enabled: boolean): void;
}

/**
 * Global debug logging state
 * null = not yet set (buffering mode)
 * true = enabled
 * false = disabled
 */
let debugLoggingEnabled: boolean | null = null;

/**
 * Buffer for logs received before debug logging state is known
 */
const logBuffer: Array<{
    level: 'log' | 'warn' | 'error';
    args: unknown[];
}> = [];

const MAX_BUFFER_SIZE = 100;

/**
 * Set global debug logging state
 * @param enabled Whether debug logging is enabled
 */
export function setDebugLogging(enabled: boolean): void {
    debugLoggingEnabled = enabled;

    // Flush buffered logs if logging is enabled
    if (enabled && logBuffer.length > 0) {
        logBuffer.forEach(({ level, args }) => {
            if (level === 'log') {
                console.log(...args);
            } else if (level === 'warn') {
                console.warn(...args);
            } else if (level === 'error') {
                console.error(...args);
            }
        });
    }

    // Clear buffer after processing
    logBuffer.length = 0;
}

/**
 * Create a contextual logger instance with preset context
 * @param context The context name to use for all log messages
 * @param enabledByDefault Whether this logger is enabled by default (defaults to true)
 * @returns Logger instance with context preset
 */
export function createLogger(context: string, enabledByDefault = true): Logger {
    let localEnabled = enabledByDefault;

    /**
     * Add log to buffer if debug state is unknown
     * @param level Log level (log, warn, or error)
     * @param args Arguments to pass to console method
     */
    function bufferLog(level: 'log' | 'warn' | 'error', args: unknown[]): void {
        if (logBuffer.length < MAX_BUFFER_SIZE) {
            logBuffer.push({ level, args });
        }
    }

    return {
        info: (message: string): void => {
            if (!localEnabled) return;

            const logArgs = [`[${context}] ${message}`];

            if (debugLoggingEnabled === null) {
                // Buffer logs until we know the debug state
                bufferLog('log', logArgs);
            } else if (debugLoggingEnabled) {
                console.log(...logArgs);
            }
        },
        warn: (message: string): void => {
            if (!localEnabled) return;

            const logArgs = [`[${context}] ${message}`];

            if (debugLoggingEnabled === null) {
                bufferLog('warn', logArgs);
            } else if (debugLoggingEnabled) {
                console.warn(...logArgs);
            }
        },
        error: (message: string, error: unknown = null): void => {
            if (!localEnabled) return;

            const logArgs = error
                ? [`[${context}] ${message}`, error]
                : [`[${context}] ${message}`];

            if (debugLoggingEnabled === null) {
                bufferLog('error', logArgs);
            } else if (debugLoggingEnabled) {
                console.error(...logArgs);
            }
        },
        debug: (message: string): void => {
            if (!localEnabled) return;

            const logArgs = [`[${context}] 🔍 ${message}`];

            if (debugLoggingEnabled === null) {
                bufferLog('log', logArgs);
            } else if (debugLoggingEnabled) {
                console.log(...logArgs);
            }
        },
        setEnabled: (enabled: boolean): void => {
            localEnabled = enabled;
        },
    };
}
