/** Utility helpers specific to the activity store. */

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Normalise a string field: trim + uppercase (makes all keys case-insensitive). */
function normalise(str) {
  return String(str).trim().toUpperCase();
}

/**
 * Composite _id = userId_CATEGORY_SOURCE_DATE.
 * Acts as the idempotency key — one document per (userId, category, source, date).
 */
function buildId(userId, category, source, date) {
  const uid = userId?.toString ? userId.toString() : String(userId);
  return `${uid}_${category}_${source}_${date}`;
}

/**
 * Merge two data arrays by key.
 * - Vitals (steps, calories, distance): keyed by `time` → latest value wins per slot.
 * - Exercises: keyed by `time|activity_type` → different types at the same time coexist.
 * Incoming items always overwrite existing items at the same key.
 */
function mergeData(existing, incoming) {
  const itemKey = (item) => {
    const t = item.time != null ? String(item.time) : '';
    return item.activity_type != null ? `${t}|${item.activity_type}` : t;
  };
  const map = new Map();
  (existing || []).forEach((item) => map.set(itemKey(item), item));
  (incoming || []).forEach((item) => map.set(itemKey(item), item));
  return Array.from(map.values());
}

module.exports = { DATE_REGEX, normalise, buildId, mergeData };
