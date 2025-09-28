const mongoose = require('mongoose');

const paymentEventSchema = new mongoose.Schema({
  merchant: {
    type: String,
    required: true,
    enum: ['RAZORPAY', 'STRIPE', 'PAYPAL'],
    default: 'RAZORPAY'
  },
  external_subscription_id: {
    type: String,
    required: true,
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  event_type: {
    type: String,
    required: true,
    trim: true
  },
  event_data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  processed: {
    type: Boolean,
    default: false
  },
  processing_error: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes
paymentEventSchema.index({ external_subscription_id: 1 });
paymentEventSchema.index({ userId: 1 });
paymentEventSchema.index({ event_type: 1 });
paymentEventSchema.index({ processed: 1 });
paymentEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PaymentEvent', paymentEventSchema, 'payment_events');
