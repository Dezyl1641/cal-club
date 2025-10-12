const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  external_subscription_id: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  external_plan_id: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    required: true,
    enum: ['created', 'authenticated', 'active', 'paused', 'halted', 'cancelled', 'completed', 'expired'],
    default: 'created'
  }
}, {
  timestamps: true
});

// Indexes
// external_subscription_id already has unique index from schema definition
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ external_plan_id: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Subscription', subscriptionSchema, 'subscriptions');
