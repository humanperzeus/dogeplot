/**
 * A simple in-memory cache with TTL support
 */
export interface CacheOptions {
  ttl?: number; // Time-To-Live in seconds
  maxSize?: number; // Maximum number of items to store in the cache
  localStorage?: boolean; // Whether to persist in localStorage
  storageKey?: string; // Key to use for localStorage
}

export interface CacheEntry<T> {
  value: T;
  expiry: number; // Timestamp when this entry expires
}

export class Cache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private ttl: number; // Time-To-Live in milliseconds
  private maxSize: number;
  private localStorage: boolean;
  private storageKey: string;

  constructor(options: CacheOptions = {}) {
    const {
      ttl = 300, // Default: 5 minutes
      maxSize = 100, // Default: 100 items
      localStorage = false,
      storageKey = 'app-cache'
    } = options;

    this.cache = new Map();
    this.ttl = ttl * 1000; // Convert to milliseconds
    this.maxSize = maxSize;
    this.localStorage = localStorage && this.isLocalStorageAvailable();
    this.storageKey = storageKey;

    // Initialize from localStorage if enabled
    if (this.localStorage) {
      this.loadFromStorage();
    }
  }

  /**
   * Set a value in the cache
   */
  set(key: string, value: T, customTtl?: number): void {
    // Clean up expired entries before adding new ones
    this.cleanup();

    // If we're at max size, remove the oldest entry
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    const ttlMs = customTtl ? customTtl * 1000 : this.ttl;
    const expiry = Date.now() + ttlMs;
    
    this.cache.set(key, { value, expiry });
    
    // Update localStorage if enabled
    if (this.localStorage) {
      this.saveToStorage();
    }
  }

  /**
   * Get a value from the cache if it exists and is not expired
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    // Return null if the entry doesn't exist
    if (!entry) {
      return null;
    }
    
    // Check if the entry is expired
    if (entry.expiry < Date.now()) {
      this.cache.delete(key);
      
      // Update localStorage if enabled
      if (this.localStorage) {
        this.saveToStorage();
      }
      
      return null;
    }
    
    return entry.value;
  }

  /**
   * Check if a key exists in the cache and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete a key from the cache
   */
  delete(key: string): void {
    this.cache.delete(key);
    
    // Update localStorage if enabled
    if (this.localStorage) {
      this.saveToStorage();
    }
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
    
    // Update localStorage if enabled
    if (this.localStorage) {
      this.saveToStorage();
    }
  }

  /**
   * Get all valid (non-expired) keys in the cache
   */
  keys(): string[] {
    this.cleanup();
    return Array.from(this.cache.keys());
  }

  /**
   * Get the size of the cache (number of valid entries)
   */
  size(): number {
    this.cleanup();
    return this.cache.size;
  }

  /**
   * Remove all expired entries from the cache
   */
  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry < now) {
        this.cache.delete(key);
      }
    }
    
    // Update localStorage if enabled
    if (this.localStorage) {
      this.saveToStorage();
    }
  }

  /**
   * Check if localStorage is available in the current environment
   */
  private isLocalStorageAvailable(): boolean {
    try {
      const testKey = '__cache_test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Save the current cache to localStorage
   */
  private saveToStorage(): void {
    if (!this.localStorage) return;
    
    try {
      const serializableCache: Record<string, CacheEntry<T>> = {};
      
      // Convert Map to plain object for serialization
      for (const [key, entry] of this.cache.entries()) {
        serializableCache[key] = entry;
      }
      
      localStorage.setItem(this.storageKey, JSON.stringify(serializableCache));
    } catch (e) {
      console.error('Failed to save cache to localStorage:', e);
    }
  }

  /**
   * Load cache from localStorage
   */
  private loadFromStorage(): void {
    if (!this.localStorage) return;
    
    try {
      const storedCache = localStorage.getItem(this.storageKey);
      
      if (storedCache) {
        const parsedCache = JSON.parse(storedCache) as Record<string, CacheEntry<T>>;
        
        // Load entries into the cache Map
        for (const [key, entry] of Object.entries(parsedCache)) {
          // Only load non-expired entries
          if (entry.expiry > Date.now()) {
            this.cache.set(key, entry);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load cache from localStorage:', e);
    }
  }
}

/**
 * Create a new cache instance with the specified options
 */
export function createCache<T>(ttlSeconds: number = 300, options: Omit<CacheOptions, 'ttl'> = {}): Cache<T> {
  return new Cache<T>({ ttl: ttlSeconds, ...options });
}

/**
 * Specialized cache for search history
 */
export function createSearchHistoryCache(): Cache<string[]> {
  return new Cache<string[]>({
    ttl: 60 * 60 * 24 * 30, // 30 days
    maxSize: 1, // Only one entry needed
    localStorage: true,
    storageKey: 'bill-search-history'
  });
}

// Create default exports for common cache types
export const billCache = createCache<any>(300, { maxSize: 200 }); // 5 minutes TTL
export const searchResultsCache = createCache<any>(180, { maxSize: 50 }); // 3 minutes TTL
export const billStatsCache = createCache<any>(600, { maxSize: 10 }); // 10 minutes TTL
export const searchHistoryCache = createSearchHistoryCache();

// Helper function to add a search term to history
export function addToSearchHistory(term: string): void {
  const history = searchHistoryCache.get('history') || [];
  
  // Remove the term if it already exists to avoid duplicates
  const newHistory = history.filter(t => t !== term);
  
  // Add the new term to the beginning of the array
  newHistory.unshift(term);
  
  // Limit to 20 items
  while (newHistory.length > 20) {
    newHistory.pop();
  }
  
  searchHistoryCache.set('history', newHistory);
}

// Helper function to get search history
export function getSearchHistory(): string[] {
  return searchHistoryCache.get('history') || [];
}

// Helper function to clear search history
export function clearSearchHistory(): void {
  searchHistoryCache.set('history', []);
} 