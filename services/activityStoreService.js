const ActivityStore = require('../models/schemas/ActivityStore');
const { TimezoneConstants } = require('../config/constants');
const { getTodayDateString, isToday } = require('../utils/dateUtils');

function buildId(userId, category, source, dateStr) {
  const uid = typeof userId === 'object' && userId.toString ? userId.toString() : String(userId);
  const cat = String(category).trim().toUpperCase();
  const src = String(source).trim().toUpperCase();
  return `${uid}_${cat}_${src}_${dateStr}`;
}

function toDateStringForLocale(dateInput, timezone = TimezoneConstants.DEFAULT_TIMEZONE) {
  if (!dateInput) return getTodayDateString();
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return dateInput;
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return getTodayDateString();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
}

function mergeData(existingData, incomingData) {
  const map = new Map();
  const key = (item) => {
    const t = item.time != null ? String(item.time) : '';
    if (item.activity_type != null) return `${t}|${item.activity_type}`;
    return t;
  };
  (existingData || []).forEach((item) => map.set(key(item), item));
  (incomingData || []).forEach((item) => map.set(key(item), item));
  return Array.from(map.values());
}

class ActivityStoreService {
  /** Sync: today+same source=merge, today+other source=replace, past+no doc=create, past+doc=ignore. */
  static async sync(userId, category, source, dateInput, data) {
    const cat = String(category).trim();
    if (!cat) throw new Error('category is required.');
    const dateStr = toDateStringForLocale(dateInput);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('Invalid date.');
    const id = buildId(userId, cat, source, dateStr);
    const normalizedSource = String(source).trim().toUpperCase();
    const now = new Date();

    const existingDoc = await ActivityStore.findById(id).lean();
    const existingForDay = await ActivityStore.findOne({
      userId: userId,
      category: cat,
      date: dateStr
    }).lean();

    const isTodayCheck = isToday(dateStr);

    if (isTodayCheck) {
      if (existingDoc) {
        if (existingDoc.source === normalizedSource) {
          const mergedData = mergeData(existingDoc.data, data || []);
          await ActivityStore.findByIdAndUpdate(id, {
            data: mergedData,
            synced_at: now
          });
          return { action: 'merged', _id: id };
        }
        await ActivityStore.deleteMany({
          userId: userId,
          category: cat,
          date: dateStr
        });
      }
      await ActivityStore.findOneAndUpdate(
        { _id: id },
        {
          _id: id,
          userId: userId,
          category: cat,
          source: normalizedSource,
          date: dateStr,
          data: data || [],
          synced_at: now,
          schema_version: 1
        },
        { upsert: true, new: true }
      );
      return { action: existingDoc && existingDoc.source !== normalizedSource ? 'replaced' : 'upserted', _id: id };
    }

    if (existingForDay) {
      return { action: 'ignored', _id: id, reason: 'document_exists_for_day' };
    }
    await ActivityStore.create({
      _id: id,
      userId: userId,
      category: cat,
      source: normalizedSource,
      date: dateStr,
      data: data || [],
      synced_at: now,
      schema_version: 1
    });
    return { action: 'created', _id: id };
  }

  /** Fetch activity for one day. Optional filter: category, source. */
  static async fetch(userId, dateInput, options = {}) {
    const dateStr = toDateStringForLocale(dateInput);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return [];

    const filter = { userId: userId, date: dateStr };
    if (options.category) filter.category = String(options.category).trim();
    if (options.source) filter.source = String(options.source).trim().toUpperCase();

    const docs = await ActivityStore.find(filter).sort({ source: 1 }).lean();
    return docs;
  }

  /** Fetch activity for a date range. Optional filter: category, source. */
  static async fetchRange(userId, startDateInput, endDateInput, options = {}) {
    const startStr = toDateStringForLocale(startDateInput);
    const endStr = toDateStringForLocale(endDateInput);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr) || startStr > endStr) return [];

    const filter = {
      user_id: userId,
      date: { $gte: startStr, $lte: endStr }
    };
    if (options.category) filter.category = String(options.category).trim();
    if (options.source) filter.source = String(options.source).trim().toUpperCase();

    const docs = await ActivityStore.find(filter).sort({ date: 1, source: 1 }).lean();
    return docs;
  }
}

module.exports = ActivityStoreService;
