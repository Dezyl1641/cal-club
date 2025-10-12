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
  external_plan_id: {
    type: String,
    required: true,
    unique: true,
    trim: true
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

module.exports = mongoose.model('Plan', planSchema, 'plans');
