const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema({
  dailyCreationTime: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // Validate HH:MM format
        return /^\d{2}:\d{2}$/.test(v);
      },
      message: 'dailyCreationTime must be in HH:MM format (IST)'
    },
    index: true
  },
  activeMinutes: {
    type: Number,
    required: true,
    min: 1,
    default: 120 // 2 hours by default
  },
  type: {
    type: String,
    required: true,
    trim: true
  },
  recommendationPrompt: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

module.exports = mongoose.model('Recommendation', recommendationSchema, 'recommendations');
