/** Utility helpers specific to the activity store. */

const { CATEGORY, ACTIVITY_TYPE } = require('./activityStoreConstants');

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
 * Merge two data arrays according to category rules:
 * - SUMMARY:  incoming replaces existing entirely (latest value wins).
 * - EXERCISE: append all items; deduplicate by `start_time|end_time`.
 * - Default:  latest value wins per `activity_type`.
 */
function mergeData(existing, incoming, category) {
  const cat = category != null ? String(category).toUpperCase() : '';

  if (cat === CATEGORY.SUMMARY) {
    const map = new Map();
    (existing || []).forEach((item) => map.set(item.activity_type != null ? String(item.activity_type) : '', item));
    (incoming || []).forEach((item) => map.set(item.activity_type != null ? String(item.activity_type) : '', item));
    return Array.from(map.values());
  }

  if (cat === CATEGORY.EXERCISE) {
    const exerciseKey = (item) =>
      `${item.start_time != null ? String(item.start_time) : ''}|${item.end_time != null ? String(item.end_time) : ''}`;
    const map = new Map();
    (existing || []).forEach((item) => map.set(exerciseKey(item), item));
    (incoming || []).forEach((item) => map.set(exerciseKey(item), item));
    return Array.from(map.values());
  }

  // Default: latest value wins per activity_type
  const map = new Map();
  (existing || []).forEach((item) => map.set(item.activity_type != null ? String(item.activity_type) : '', item));
  (incoming || []).forEach((item) => map.set(item.activity_type != null ? String(item.activity_type) : '', item));
  return Array.from(map.values());
}

module.exports = { DATE_REGEX, normalise, buildId, mergeData, CATEGORY, ACTIVITY_TYPE };
