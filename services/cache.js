const cache = new Map();
const DEFAULT_TTL = 5 * 60 * 1000;

function set(key, value, ttl = DEFAULT_TTL) {
  cache.set(key, { value, expires: Date.now() + ttl });
}

function get(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

module.exports = { set, get };