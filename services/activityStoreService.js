const ActivityStore = require('../models/schemas/ActivityStore');
const { isToday, resolveDate } = require('../utils/dateUtils');
const { DATE_REGEX, buildId, mergeData, normalise } = require('../utils/activityStoreUtils');

class ActivityStoreService {
  /**
   * Sync health data for a (user_id, category, source, date) tuple.
   *
   * - Different sources → separate documents, never interfere with each other.
   * - Today  + doc exists → merge (safe for repeated syncs throughout the day).
   * - Today  + no doc     → create.
   * - Past   + doc exists → ignore (past docs are immutable).
   * - Past   + no doc     → create.
   */
  static async sync(userId, category, source, dateInput, data) {
    const categoryName = normalise(category);
    if (!categoryName) throw new Error('category is required.');

    const dateStr = resolveDate(dateInput);
    if (!DATE_REGEX.test(dateStr)) throw new Error('Invalid date.');

    const src = normalise(source);
    const id  = buildId(userId, categoryName, src, dateStr);
    const date = new Date(`${dateStr}T00:00:00.000Z`);

    const existing = await ActivityStore.findById(id).lean();

    if (existing) {
      if (isToday(dateStr)) {
        await ActivityStore.findByIdAndUpdate(id, { data: mergeData(existing.data, data) });
        return { action: 'merged', _id: id };
      }
      return { action: 'ignored', _id: id, reason: 'past_doc_immutable' };
    }

    await ActivityStore.create({ _id: id, user_id: userId, category: categoryName, source: src, date, data: data || [], schema_version: 1 });
    return { action: 'created', _id: id };
  }

  /** Fetch all docs for a single day. Optionally filter by category and/or source. */
  static async fetch(userId, dateInput, { category, source } = {}) {
    const dateStr = resolveDate(dateInput);
    if (!DATE_REGEX.test(dateStr)) return [];

    const filter = { user_id: userId, date: new Date(`${dateStr}T00:00:00.000Z`) };
    if (category) filter.category = normalise(category);
    if (source)  filter.source   = normalise(source);

    return ActivityStore.find(filter).sort({ category: 1, source: 1 }).lean();
  }

  /** Fetch all docs for a date range [from, to] inclusive. Optionally filter by category and/or source. */
  static async fetchRange(userId, fromInput, toInput, { category, source } = {}) {
    const from = resolveDate(fromInput);
    const to   = resolveDate(toInput);
    if (!DATE_REGEX.test(from) || !DATE_REGEX.test(to) || from > to) return [];

    const filter = {
      user_id: userId,
      date: { $gte: new Date(`${from}T00:00:00.000Z`), $lte: new Date(`${to}T00:00:00.000Z`) }
    };
    if (category) filter.category = normalise(category);
    if (source)  filter.source   = normalise(source);

    return ActivityStore.find(filter).sort({ date: 1, category: 1, source: 1 }).lean();
  }
}

module.exports = ActivityStoreService;
