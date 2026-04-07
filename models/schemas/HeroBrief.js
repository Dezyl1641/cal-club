const mongoose = require('mongoose');

const heroBriefSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: String,
    required: true
  },
  phase: {
    type: String,
    enum: ['morning', 'midday', 'evening'],
    required: true
  },
  guidanceText: {
    type: String,
    required: true
  },
  tier: {
    type: Number,
    enum: [0, 1, 2]
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  inputHash: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 30 * 24 * 60 * 60 // 30-day TTL
  }
});

// Unique compound index for cache key
heroBriefSchema.index({ userId: 1, date: 1, phase: 1 }, { unique: true });

module.exports = mongoose.model('HeroBrief', heroBriefSchema, 'heroBriefs');
