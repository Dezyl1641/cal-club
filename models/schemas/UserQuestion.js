const mongoose = require('mongoose');

const userQuestionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  values: [{
    type: mongoose.Schema.Types.Mixed
  }],
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
userQuestionSchema.index({ userId: 1, questionId: 1 });
userQuestionSchema.index({ userId: 1, deletedAt: 1 });
userQuestionSchema.index({ questionId: 1, deletedAt: 1 });

// Compound index to ensure unique active answers per user per question
userQuestionSchema.index({ userId: 1, questionId: 1, deletedAt: 1 }, { 
  unique: true, 
  partialFilterExpression: { deletedAt: null } 
});

module.exports = mongoose.model('UserQuestion', userQuestionSchema, 'userQuestions');
