const mongoose = require('mongoose');

const userAuthTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  token: {
    type: String,
    required: true,
    trim: true
  },
  isRevoked: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// Indexes
userAuthTokenSchema.index({ userId: 1 }, { unique: true });
userAuthTokenSchema.index({ token: 1 });
userAuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('UserAuthToken', userAuthTokenSchema, 'userAuthTokens'); 