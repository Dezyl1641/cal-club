const mongoose = require('mongoose');

const deviceDetailSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deviceToken: {
    type: String,
    required: true,
    trim: true
  },
  platform: {
    type: String,
    required: true,
    enum: ['ios', 'android', 'web'],
    trim: true
  },
  deviceId: {
    type: String,
    trim: true
  },
  appVersion: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUsedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
deviceDetailSchema.index({ userId: 1 });
deviceDetailSchema.index({ deviceToken: 1 });
deviceDetailSchema.index({ userId: 1, deviceToken: 1 }, { unique: true }); // One token per user
deviceDetailSchema.index({ isActive: 1 });
deviceDetailSchema.index({ lastUsedAt: -1 });

module.exports = mongoose.model('DeviceDetail', deviceDetailSchema, 'deviceDetails');

