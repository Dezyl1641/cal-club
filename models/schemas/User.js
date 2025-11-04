const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\+?[1-9]\d{1,14}$/.test(v); // Basic phone validation
      },
      message: props => `${props.value} is not a valid phone number!`
    }
  },
  name: {
    type: String,
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: props => `${props.value} is not a valid email!`
    }
  },
  goals: {
    goal: {
      type: String,
      trim: true,
      maxlength: 200
    },
    dailyCalories: {
      type: Number,
      min: 0,
      max: 10000,
      default: 2000
    },
    dailyProtein: {
      type: Number,
      min: 0,
      max: 1000,
      default: 150
    },
    dailyCarbs: {
      type: Number,
      min: 0,
      max: 2000,
      default: 250
    },
    dailyFats: {
      type: Number,
      min: 0,
      max: 500,
      default: 65
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLoginAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
userSchema.index({ phone: 1 });
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema, 'users'); 