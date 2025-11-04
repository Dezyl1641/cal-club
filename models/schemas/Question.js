const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true
  },
  subtext: {
    type: String,
    trim: true
  },
  icon: {
    type: String,
    trim: true
  }
}, { _id: false });

const imageSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    trim: true
  },
  paddingHorizontal: {
    type: Number,
    default: 0
  },
  paddingVertical: {
    type: Number,
    default: 0
  },
  height: {
    type: Number
  }
}, { _id: false });

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
    enum: [
      'NO_INPUT',
      'NAME_INPUT',
      'SELECT',
      'PICKER',
      'DATE',
      'SUMMARY',
      'SLIDER',
      'REFERRAL_INPUT',
      'PLAN_SUMMARY',
      'MEAL_TIMING',
      'NOTIFICATION_PERMISSION',
      'GOAL_CALCULATION',
      // Legacy types for backward compatibility
      'text',
      'number',
      'select',
      'multiselect',
      'radio',
      'checkbox',
      'textarea',
      'date',
      'email',
      'phone'
    ],
    default: 'text'
  },
  options: [optionSchema],
  image: imageSchema,
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
