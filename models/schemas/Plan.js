const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  duration: {
    type: Number,
    required: true,
    min: 1
  },
  durationUnit: {
    type: String,
    required: true,
    enum: ['day', 'week', 'month', 'year'],
    default: 'month'
  },
  frequency: {
    type: String,
    required: true,
    trim: true
  },
  // Razorpay plan ID
  external_plan_id: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  // Google Play product/subscription ID
  googleplay_product_id: {
    type: String,
    trim: true,
    sparse: true // Allow null, but unique when present
  },
  // Apple App Store product ID (for future use)
  appstore_product_id: {
    type: String,
    trim: true,
    sparse: true
  },
  // Platform availability
  platform: {
    type: String,
    enum: ['ALL', 'ANDROID', 'IOS', 'WEB'],
    default: 'ALL'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
// external_plan_id already has unique index from schema definition
planSchema.index({ isActive: 1 });
planSchema.index({ createdAt: -1 });
planSchema.index({ platform: 1 });
// Note: googleplay_product_id and appstore_product_id don't need explicit indexes
// unless they need to be unique or queried frequently

module.exports = mongoose.model('Plan', planSchema, 'plans');
