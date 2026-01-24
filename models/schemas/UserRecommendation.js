const mongoose = require('mongoose');

const userRecommendationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  recommendationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Recommendation',
    required: true
  },
  idempotenceId: {
    type: String,
    required: true,
    index: true,
    // Format: recommendationId_YYYY-MM-DD
    validate: {
      validator: function(v) {
        return /^[a-f0-9]{24}_\d{4}-\d{2}-\d{2}$/.test(v);
      },
      message: 'idempotenceId must be in format: recommendationId_YYYY-MM-DD'
    }
  },
  value: {
    type: String,
    required: true // The actual recommendation text
  },
  activeFrom: {
    type: Date,
    required: true,
    index: true
  },
  activeTo: {
    type: Date,
    required: true,
    index: true
  },
  notificationId: {
    type: String,
    default: null // Firebase notification ID
  },
  notificationSent: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Compound index for efficient queries
userRecommendationSchema.index({ userId: 1, activeFrom: 1, activeTo: 1 });
userRecommendationSchema.index({ userId: 1, createdAt: -1 });

// Ensure unique recommendation per user per day
userRecommendationSchema.index({ userId: 1, recommendationId: 1, idempotenceId: 1 }, { unique: true });

module.exports = mongoose.model('UserRecommendation', userRecommendationSchema, 'user_recommendations');
