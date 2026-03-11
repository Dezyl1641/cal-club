const mongoose = require('mongoose');

/** One doc per (user_id, category, source, date). */
const activityStoreSchema = new mongoose.Schema({
  _id: {
    type: String
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  source: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  /** Midnight UTC of the calendar day (e.g. 2026-02-15T00:00:00.000Z). */
  date: {
    type: Date,
    required: true
  },
  data: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  schema_version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true,
  _id: true
});

/** Primary lookup: all docs for a user on a given day (with optional category/source filter). */
activityStoreSchema.index({ user_id: 1, date: 1, category: 1, source: 1 });

/** Range queries across dates. */
activityStoreSchema.index({ user_id: 1, category: 1, date: 1 });

module.exports = mongoose.model('ActivityStore', activityStoreSchema, 'activity_store');
