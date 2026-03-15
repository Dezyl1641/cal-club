const ActivityStore = require('../../models/schemas/ActivityStore');
const { isToday, resolveDate } = require('../../utils/dateUtils');
const { DATE_REGEX, buildId, mergeData, normalise } = require('../../utils/activityStoreUtils');

/**
 * Base class for category-specific syncers.
 * Subclasses must implement:
 *   - get category()     → string (e.g. 'SUMMARY', 'EXERCISE')
 *   - filter(data)       → array of items relevant to this category
 * Subclasses may override:
 *   - mergeData(existing, incoming) → merged array (defaults to util mergeData with this.category)
 */
class BaseCategorySyncer {
  get category() {
    throw new Error(`${this.constructor.name} must implement get category()`);
  }

  filter(_data) {
    throw new Error(`${this.constructor.name} must implement filter(data)`);
  }

  mergeData(existing, incoming) {
    return mergeData(existing, incoming, normalise(this.category));
  }

  async sync(userId, source, dateInput, data) {
    const categoryName = normalise(this.category);
    const dateStr = resolveDate(dateInput);
    if (!DATE_REGEX.test(dateStr)) throw new Error('Invalid date.');

    const src = normalise(source);
    const id  = buildId(userId, categoryName, src, dateStr);
    const filtered = this.filter(data || []);
    if (filtered.length === 0) {
      return { category: categoryName, action: 'ignored', _id: id, reason: 'no_relevant_data' };
    }

    const existing = await ActivityStore.findById(id).lean();

    if (existing) {
      if (isToday(dateStr)) {
        await ActivityStore.findByIdAndUpdate(id, { data: this.mergeData(existing.data, filtered) });
        return { category: categoryName, action: 'merged', _id: id };
      }
      return { category: categoryName, action: 'ignored', _id: id, reason: 'past_doc_immutable' };
    }

    await ActivityStore.create({ _id: id, user_id: userId, category: categoryName, source: src, date: dateStr, data: filtered, schema_version: 1 });
    return { category: categoryName, action: 'created', _id: id };
  }
}

module.exports = BaseCategorySyncer;
