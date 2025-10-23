import { STORAGE_KEYS } from './constants';
import { Storage } from './storage';
import {
    DEFAULT_SETTINGS,
    parseSettings,
    type Settings,
} from './settings-schema';
import { createLogger } from './logger';

const logger = createLogger('SettingsManager');

/**
 * Settings utility class for type-safe settings management
 */
export class SettingsManager {
    /**
     * Load settings from storage with validation
     * @returns Validated settings object
     */
    static async load(): Promise<Settings> {
        const stored = await Storage.get(STORAGE_KEYS.SETTINGS);

        try {
            // Parse and validate settings (use empty object if nothing stored)
            return parseSettings(stored ?? {});
        } catch (error) {
            logger.error('Failed to load settings:', error);
            logger.warn('Returning default settings');
            await Storage.set(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
            // Return default settings if validation fails
            return { ...DEFAULT_SETTINGS };
        }
    }

    /**
     * Set a single setting key-value pair
     * @param key Settings property key
     * @param value Value to set
     */
    static set<K extends keyof Settings>(
        key: K,
        value: Settings[K],
    ): Promise<void>;

    /**
     * Set multiple settings
     * @param settings Partial settings object
     */
    static set(settings: Partial<Settings>): Promise<void>;

    /**
     * Implementation of set method (see overloads above for public API)
     * @param keyOrSettings Single key or partial settings object
     * @param value Optional value when first param is a key
     */
    static async set<K extends keyof Settings>(
        keyOrSettings: K | Partial<Settings>,
        value?: Settings[K],
    ): Promise<void> {
        const settings = typeof keyOrSettings === 'string'
            ? ({ [keyOrSettings]: value } as Partial<Settings>)
            : keyOrSettings;

        await SettingsManager.save(settings);
    }

    /**
     * Save settings to storage
     * @param settings Settings object to save
     */
    static async save(settings: Partial<Settings>): Promise<void> {
        // Load existing settings first
        const current = await SettingsManager.load();

        // Merge with new settings
        const updated = { ...current, ...settings };

        // Validate before saving
        const validated = parseSettings(updated);

        // Save to storage
        await Storage.set(STORAGE_KEYS.SETTINGS, validated);
    }

    /**
     * Update specific setting fields
     * @param updates Partial settings to update
     */
    static async update(updates: Partial<Settings>): Promise<void> {
        await SettingsManager.save(updates);
    }

    /**
     * Reset settings to defaults
     */
    static async reset(): Promise<void> {
        await Storage.set(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    }

    /**
     * Get a single setting value
     * @param key Setting key
     * @returns Setting value
     */
    static get<K extends keyof Settings>(key: K): Promise<Settings[K]>;

    /**
     * Get multiple setting values
     * @param keys Array of setting keys
     * @returns Object with requested settings
     */
    static get<K extends keyof Settings>(
        keys: K[],
    ): Promise<Pick<Settings, K>>;

    /**
     * Implementation of get method (see overloads above for public API)
     * @param keyOrKeys Single key or array of keys
     * @returns Setting value or object with multiple values
     */
    static async get<K extends keyof Settings>(
        keyOrKeys: K | K[],
    ): Promise<Settings[K] | Pick<Settings, K>> {
        const settings = await SettingsManager.load();

        if (Array.isArray(keyOrKeys)) {
            // Return object with requested keys
            const result = {} as Pick<Settings, K>;
            for (const key of keyOrKeys) {
                result[key] = settings[key];
            }
            return result;
        }

        // Return single value
        return settings[keyOrKeys];
    }
}
