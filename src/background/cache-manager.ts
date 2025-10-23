import { STORAGE_KEYS } from '../shared/constants';
import { createLogger } from '../shared/logger';
import { Storage } from '../shared/storage';

const logger = createLogger('CacheManager');

const CACHE_SAVE_DELAY_MS = 2000;

/**
 * Cache metadata structure
 */
interface CacheMeta {
    lastSaved?: number;
    count?: number;
}

/**
 * Cached data entry structure
 */
interface CachedDataEntry<T> {
    data: T;
    lastAccess: number;
}

/**
 * Type for the cache data stored in chrome.storage
 */
type CacheData<T> = Record<string, CachedDataEntry<T>>;

/**
 * Storage result type when loading cache
 */
interface CacheStorageResult<T> {
    [STORAGE_KEYS.LLM_ANALYSIS_CACHE]?: CacheData<T>;
    [STORAGE_KEYS.LLM_CACHE_META]?: CacheMeta;
}

/**
 * Generic cache manager with persistent storage and debounced saving
 * Cache keys should include model identifiers for proper cache isolation
 */
export class CacheManager<T> {
    private cache: Map<string, T>;

    private cacheChanged: boolean;

    private saveTimeout: NodeJS.Timeout | null;

    /**
     * Create a new cache manager
     */
    constructor() {
        this.cache = new Map();
        this.cacheChanged = false;
        this.saveTimeout = null;
    }

    /**
     * Load cache from storage
     * Model-specific cache invalidation is handled by cache keys including model identifiers
     */
    async load(): Promise<void> {
        try {
            const result = await Storage.get([
                STORAGE_KEYS.LLM_ANALYSIS_CACHE,
                STORAGE_KEYS.LLM_CACHE_META,
            ]) as CacheStorageResult<T>;

            const cachedData = result[
                STORAGE_KEYS.LLM_ANALYSIS_CACHE
            ] || {};

            Object.entries(cachedData).forEach(([key, entry]) => {
                this.cache.set(key, entry.data);
            });
            logger.info(`Loaded ${this.cache.size} cached entries`);
        } catch (error) {
            logger.error('Failed to load cache:', error);
        }
    }

    /**
     * Save cache to storage with metadata
     */
    async save(): Promise<void> {
        if (!this.cache || this.cache.size === 0 || !this.cacheChanged) {
            return;
        }

        try {
            const cacheData: CacheData<T> = {};
            const now = Date.now();

            for (const [key, data] of this.cache) {
                cacheData[key] = {
                    data,
                    lastAccess: now,
                };
            }

            await Storage.set({
                [STORAGE_KEYS.LLM_ANALYSIS_CACHE]: cacheData,
                [STORAGE_KEYS.LLM_CACHE_META]: {
                    lastSaved: now,
                    count: this.cache.size,
                },
            });

            logger.info(`Saved ${this.cache.size} entries to storage`);
            this.cacheChanged = false;
        } catch (error) {
            logger.error('Failed to save cache:', error);
        }
    }

    /**
     * Debounced cache save
     */
    debouncedSave(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(() => {
            this.save();
        }, CACHE_SAVE_DELAY_MS);
    }

    /**
     * Get value from cache
     * @param key Cache key
     * @returns Cached value or undefined
     */
    get(key: string): T | undefined {
        return this.cache.get(key);
    }

    /**
     * Set a value in the cache
     * @param key Cache key
     * @param value Value to cache
     */
    set(key: string, value: T): void {
        this.cache.set(key, value);
        this.cacheChanged = true;
        this.debouncedSave();
    }

    /**
     * Clear all cached data
     */
    async clear(): Promise<void> {
        this.cache.clear();

        // Explicitly save empty cache to storage
        try {
            await Storage.set({
                [STORAGE_KEYS.LLM_ANALYSIS_CACHE]: {},
                [STORAGE_KEYS.LLM_CACHE_META]: {
                    lastSaved: Date.now(),
                    count: 0,
                },
            });

            this.cacheChanged = false;
            logger.info('Saved 0 entries to storage (cache cleared)');
        } catch (error) {
            logger.error('Failed to clear cache in storage:', error);
        }
    }

    /**
     * Get cache size
     * @returns Number of cached entries
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Force save cache immediately (for shutdown)
     */
    async forceSave(): Promise<void> {
        if (this.cacheChanged) {
            await this.save();
        }
    }
}
