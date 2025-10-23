// Storage utility for chrome extension storage

/**
 * Storage class for chrome extension storage operations with type safety
 */
export class Storage {
    /**
     * Get a single item from chrome.storage.local
     * @param key Single key to retrieve
     * @returns Promise resolving to the value or undefined
     */
    static get(key: string): Promise<unknown>;

    /**
     * Get multiple items from chrome.storage.local
     * @param keys Array of keys to retrieve
     * @returns Promise resolving to object with key-value pairs
     */
    static get(keys: string[]): Promise<Record<string, unknown>>;

    /**
     * Implementation of get method (see overloads above for public API)
     * @param keys Single key or array of keys
     * @returns Promise with value or record
     */
    static get(keys: string | string[]):
    Promise<unknown | Record<string, unknown>> {
        const isSingleKey = typeof keys === 'string';
        const keysArray = isSingleKey ? [keys] : keys;

        return new Promise((resolve) => {
            chrome.storage.local.get(keysArray, (result) => {
                if (isSingleKey) {
                    // Return value directly for single key
                    resolve(result[keys as string]);
                } else {
                    // Return full object for array of keys
                    resolve(result);
                }
            });
        });
    }

    /**
     * Set a single key-value pair in chrome.storage.local
     * @param key Storage key
     * @param value Value to store
     * @returns Promise that resolves when item is stored
     */
    static set(key: string, value: unknown): Promise<void>;

    /**
     * Set multiple items in chrome.storage.local
     * @param items Items to store as key-value pairs
     * @returns Promise that resolves when items are stored
     */
    static set(items: Record<string, unknown>): Promise<void>;

    /**
     * Implementation of set method (see overloads above for public API)
     * @param keyOrItems Single key or object with key-value pairs
     * @param value Optional value when first param is a key
     * @returns Promise that resolves when items are stored
     */
    static set(
        keyOrItems: string | Record<string, unknown>,
        value?: unknown,
    ): Promise<void> {
        const items = typeof keyOrItems === 'string'
            ? { [keyOrItems]: value }
            : keyOrItems;

        return new Promise((resolve) => {
            chrome.storage.local.set(items, resolve);
        });
    }

    /**
     * Remove items from chrome.storage.local
     * @param keys Single key or array of keys to remove
     * @returns Promise that resolves when items are removed
     */
    static remove(keys: string | string[]): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.remove(keys, resolve);
        });
    }

    /**
     * Clear all items from chrome.storage.local
     * @returns Promise that resolves when storage is cleared
     */
    static clear(): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.clear(resolve);
        });
    }
}
