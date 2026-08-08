const NodeCache = require('node-cache');

// Standard TTL 5 minutes (300 seconds), check for expired keys every 60 seconds
const cache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  useClones: false, // High performance: store & return references without cloning
});

/**
 * Get item from cache
 */
function get(key) {
  return cache.get(key);
}

/**
 * Set item in cache with optional custom TTL in seconds
 */
function set(key, value, ttlSeconds = 300) {
  return cache.set(key, value, ttlSeconds);
}

/**
 * Delete a specific key
 */
function del(key) {
  return cache.del(key);
}

/**
 * Delete all keys starting with a prefix (e.g., 'products:store_123')
 */
function delByPrefix(prefix) {
  const keys = cache.keys();
  const matching = keys.filter(k => k.startsWith(prefix));
  if (matching.length > 0) {
    cache.del(matching);
  }
}

/**
 * Flush all cached entries
 */
function flush() {
  cache.flushAll();
}

module.exports = {
  cache,
  get,
  set,
  del,
  delByPrefix,
  flush,
};
