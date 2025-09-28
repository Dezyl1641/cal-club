const mongoose = require('mongoose');

const externalSubscriptionSchema = new mongoose.Schema({
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
externalSubscriptionSchema.index({ userId: 1 });
externalSubscriptionSchema.index({ external_plan_id: 1 });
externalSubscriptionSchema.index({ status: 1 });
externalSubscriptionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ExternalSubscription', externalSubscriptionSchema, 'external_subscriptions');
