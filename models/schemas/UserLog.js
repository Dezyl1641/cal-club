const mongoose = require('mongoose');

const userLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['WEIGHT'], // Can be extended later with other types
    trim: true
  },
  value: {
    type: String,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true,
    trim: true,
    maxlength: 20
  },
  date: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^\d{4}-\d{2}-\d{2}$/.test(v); // YYYY-MM-DD format
      },
      message: props => `${props.value} is not a valid date format (YYYY-MM-DD)`
    }
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Compound index for efficient queries (userId + date)
userLogSchema.index({ userId: 1, date: -1 });
userLogSchema.index({ userId: 1, type: 1, date: -1 });

// Ensure unique log per user per type per date
userLogSchema.index({ userId: 1, type: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('UserLog', userLogSchema, 'user_logs');

