// Translator utility for i18n messages

/**
 * Type for message substitutions
 */
type Substitutions = string | string[];

/**
 * Translator class for getting localized messages
 */
export class Translator {
    /**
     * Get localized message
     * @param key Message key from messages.json
     * @param substitutions Optional substitution values
     * @returns Localized message string
     */
    static getMessage(key: string, substitutions?: Substitutions): string {
        return chrome.i18n.getMessage(key, substitutions);
    }
}
