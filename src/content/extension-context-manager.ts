import { createLogger } from '../shared/logger';
import { BlurManager } from './blur-manager';

const logger = createLogger('ExtensionContextManager');

/**
 * ExtensionContextManager: Manages extension context validation
 * and invalidation scenarios
 */
export class ExtensionContextManager {
    static extensionContextValid = true;

    /**
     * Check if extension context is valid
     * @returns True if extension context is valid
     */
    static isValid(): boolean {
        try {
            if (chrome?.runtime?.id) {
                return ExtensionContextManager.extensionContextValid;
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Check if an error indicates context invalidation
     * @param error Error to check
     * @returns True if error indicates context invalidation
     */
    static isContextInvalidatedError(error: Error): boolean {
        return (
            error.message.includes('Extension context invalidated')
            || error.message.includes('message channel closed')
        );
    }

    /**
     * Handle extension context invalidation
     * @param cleanupCallback Callback to perform cleanup operations
     */
    static handleInvalidated(cleanupCallback?: () => void): void {
        ExtensionContextManager.extensionContextValid = false;
        const errorMsg = '🚨 Extension context invalidated! '
            + 'Stopping all operations...';
        logger.error(errorMsg);

        // Perform cleanup
        try {
            if (cleanupCallback) {
                cleanupCallback();
            }

            // Force cleanup all blur overlays
            BlurManager.unblurAll();
        } catch (error) {
            logger.warn(`Error during emergency cleanup: ${error}`);
        }

        // Show user-friendly message
        const infoMsg = '🔄 Please refresh the page to restart '
            + 'the extension.';
        logger.info(infoMsg);
    }
}
