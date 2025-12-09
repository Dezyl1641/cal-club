const mongoose = require('mongoose');

const notificationPreferenceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['BREAKFAST', 'LUNCH', 'DINNER'],
    uppercase: true
  },
  time: {
    type: String,
    required: true,
    trim: true
    // Format: "HH:MM" in 24-hour format for cron matching (e.g., "08:00", "13:00", "19:00")
  },
  displayTime: {
    type: String,
    trim: true
    // Format: "08:00 AM", "01:00 PM" for display purposes
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
notificationPreferenceSchema.index({ userId: 1 });
notificationPreferenceSchema.index({ userId: 1, type: 1 });
notificationPreferenceSchema.index({ userId: 1, isActive: 1 });
notificationPreferenceSchema.index({ time: 1, isActive: 1 });
notificationPreferenceSchema.index({ isActive: 1 });

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema, 'notification_preferences');

