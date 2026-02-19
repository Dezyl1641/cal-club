const mongoose = require('mongoose');

/** One doc per (user, category, source, date). */
const activityStoreSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  category: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  source: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    index: true
  },
  /** Calendar day YYYY-MM-DD in user's locale (default IST). No UTC conversion. */
  date: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  data: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  synced_at: {
    type: Date,
    default: Date.now
  },
  schema_version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true,
  _id: true
});

module.exports = mongoose.model('ActivityStore', activityStoreSchema, 'activity_store');
