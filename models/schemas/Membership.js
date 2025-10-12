const mongoose = require('mongoose');

const membershipSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscription',
    required: true
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    required: true
  },
  start: {
    type: Date,
    required: true
  },
  end: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'expired', 'cancelled', 'suspended'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Indexes
membershipSchema.index({ userId: 1 });
membershipSchema.index({ subscriptionId: 1 });
membershipSchema.index({ planId: 1 });
membershipSchema.index({ status: 1 });
membershipSchema.index({ start: 1 });
membershipSchema.index({ end: 1 });
membershipSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Membership', membershipSchema, 'memberships');
