const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  subtext: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  type: {
    type: String,
    required: true,
    enum: ['text', 'number', 'select', 'multiselect', 'radio', 'checkbox', 'textarea', 'date', 'email', 'phone'],
    default: 'text'
  },
  options: [{
    type: String,
    trim: true
  }],
  sequence: {
    type: Number,
    required: true,
    unique: true,
    min: 1
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
questionSchema.index({ isActive: 1, sequence: 1 });

module.exports = mongoose.model('Question', questionSchema, 'questions');
