const ActivityStore = require('../models/schemas/ActivityStore');
const { resolveDate } = require('../utils/dateUtils');
const { DATE_REGEX, normalise } = require('../utils/activityStoreUtils');
const syncers = require('./activitySyncers/index.js');

class ActivityStoreService {
  /**
   * Sync health data for a (userId, source) across multiple dates.
   * records: [{ date, data[] }]
   * Each record is split across category syncers (SUMMARY, EXERCISE),
   * producing one document per (userId, category, source, date).
   */
  static async sync(userId, source, records) {
    if (!source) throw new Error('source is required.');
    const results = await Promise.all(
      records.flatMap(({ date, data }) => syncers.map((s) => s.sync(userId, source, date, data)))
    );
    return results;
  }

  /** Fetch all docs for a single day. Optionally filter by category and/or source. */
  static async fetch(userId, dateInput, { category, source } = {}) {
    const dateStr = resolveDate(dateInput);
    if (!DATE_REGEX.test(dateStr)) return [];

    const filter = { user_id: userId, date: dateStr };
    if (category) filter.category = normalise(category);
    if (source)   filter.source   = normalise(source);

    return ActivityStore.find(filter).sort({ category: 1, source: 1 }).lean();
  }

  /** Fetch all docs for a date range [from, to] inclusive. Optionally filter by category and/or source. */
  static async fetchRange(userId, fromInput, toInput, { category, source } = {}) {
    const from = resolveDate(fromInput);
    const to   = resolveDate(toInput);
    if (!DATE_REGEX.test(from) || !DATE_REGEX.test(to) || from > to) return [];

    const filter = {
      user_id: userId,
      date: { $gte: from, $lte: to }
    };
    if (category) filter.category = normalise(category);
    if (source)   filter.source   = normalise(source);

    return ActivityStore.find(filter).sort({ date: 1, category: 1, source: 1 }).lean();
  }
}

module.exports = ActivityStoreService;
