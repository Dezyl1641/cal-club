const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Payment provider: RAZORPAY, GOOGLE_PLAY, APPLE
  provider: {
    type: String,
    required: true,
    enum: ['RAZORPAY', 'GOOGLE_PLAY', 'APPLE'],
    default: 'RAZORPAY'
  },
  // Razorpay: subscription ID | Google Play: purchase token | Apple: transaction ID
  external_subscription_id: {
    type: String,
    required: true,
    trim: true
  },
  // Razorpay: plan ID | Google Play: product ID | Apple: product ID
  external_plan_id: {
    type: String,
    required: true,
    trim: true
  },
  // Generic order ID (Razorpay: N/A | Google Play: orderId | Apple: originalTransactionId)
  external_order_id: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    required: true,
    enum: [
      'created',        // Initial state
      'authenticated',  // Razorpay: user authenticated
      'active',         // Subscription is active
      'paused',         // Subscription paused
      'halted',         // Razorpay: payment failed
      'cancelled',      // User cancelled
      'completed',      // Subscription completed its term
      'expired',        // Subscription expired
      'on_hold',        // Google Play: payment issue, grace period
      'in_grace_period' // Google Play: grace period before cancellation
    ],
    default: 'created'
  },
  // Subscription period timestamps (for Google Play/Apple)
  currentPeriodStart: {
    type: Date
  },
  currentPeriodEnd: {
    type: Date
  },
  // Auto-renewal status
  autoRenewing: {
    type: Boolean,
    default: true
  },
  // Whether the purchase has been acknowledged (required for Google Play)
  acknowledged: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
// Compound unique index: same subscription ID can exist across different providers
subscriptionSchema.index({ provider: 1, external_subscription_id: 1 }, { unique: true });
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ external_plan_id: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ createdAt: -1 });
subscriptionSchema.index({ provider: 1 });
subscriptionSchema.index({ external_order_id: 1 }, { sparse: true });

module.exports = mongoose.model('Subscription', subscriptionSchema, 'subscriptions');
