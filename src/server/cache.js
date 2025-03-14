/**
 * Server-side in-memory cache for statistics
 * This cache is shared across all user requests
 */

// Cache storage
const cache = new Map();

// Default TTL: 24 hours in milliseconds (increased from 24 hours)
const DEFAULT_TTL = 24 * 60 * 60 * 1000;

// Maximum number of entries in the cache
const MAX_CACHE_SIZE = 500;

// Track access times for LRU eviction
const accessTimes = new Map();

/**
 * Get an item from the cache
 * @param {string} key - Cache key
 * @returns {any|null} - Cached value or null if not found/expired
 */
function get(key) {
  if (!cache.has(key)) {
    return null;
  }

  const item = cache.get(key);
  const now = Date.now();

  // Check if item is expired
  if (item.expiry < now) {
    cache.delete(key);
    accessTimes.delete(key);
    return null;
  }

  // Update access time for LRU tracking
  accessTimes.set(key, now);

  return item.value;
}

/**
 * Set an item in the cache
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in milliseconds (default: 24 hours)
 */
function set(key, value, ttl = DEFAULT_TTL) {
  const expiry = Date.now() + ttl;
  
  // Check if we need to evict entries due to size limit
  if (cache.size >= MAX_CACHE_SIZE && !cache.has(key)) {
    evictLRU();
  }
  
  cache.set(key, { value, expiry });
  accessTimes.set(key, Date.now());
  
  // Log cache update
  console.log(`🔄 Server cache updated: ${key} (expires in ${ttl/1000/60/60} hours)`);
}

/**
 * Evict the least recently used cache entry
 */
function evictLRU() {
  if (accessTimes.size === 0) return;
  
  // Find the least recently used key
  let oldestKey = null;
  let oldestTime = Infinity;
  
  for (const [key, time] of accessTimes.entries()) {
    if (time < oldestTime) {
      oldestTime = time;
      oldestKey = key;
    }
  }
  
  if (oldestKey) {
    console.log(`🧹 Evicting LRU cache entry: ${oldestKey}`);
    cache.delete(oldestKey);
    accessTimes.delete(oldestKey);
  }
}

/**
 * Delete an item from the cache
 * @param {string} key - Cache key
 */
function del(key) {
  cache.delete(key);
  accessTimes.delete(key);
}

/**
 * Clear all items from the cache
 */
function clear() {
  cache.clear();
  accessTimes.clear();
}

/**
 * Get cache statistics
 * @returns {object} - Cache statistics
 */
function stats() {
  const now = Date.now();
  const items = Array.from(cache.entries());
  const total = items.length;
  const expired = items.filter(([_, item]) => item.expiry < now).length;
  const valid = total - expired;
  
  return {
    total,
    valid,
    expired,
    keys: Array.from(cache.keys()),
    maxSize: MAX_CACHE_SIZE
  };
}

module.exports = {
  get,
  set,
  del,
  clear,
  stats
}; 