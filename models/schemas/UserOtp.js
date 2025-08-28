const mongoose = require('mongoose');

const userOtpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\+?[1-9]\d{1,14}$/.test(v);
      },
      message: props => `${props.value} is not a valid phone number!`
    }
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  otp: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^\d{6}$/.test(v);
      },
      message: props => `${props.value} is not a valid 6-digit OTP!`
    }
  },
  attempts: {
    type: Number,
    default: 0,
    max: 5
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 900 // 15 minutes TTL
  }
}, {
  timestamps: false
});

// Indexes
userOtpSchema.index({ phone: 1 }, { unique: true });
userOtpSchema.index({ userId: 1 });

module.exports = mongoose.model('UserOtp', userOtpSchema, 'userOtps'); 