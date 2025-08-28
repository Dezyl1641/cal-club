const mongoose = require('mongoose');

const nutritionSchema = new mongoose.Schema({
  calories: {
    llm: Number,
    final: Number
  },
  protein: {
    llm: Number,
    final: Number
  },
  carbs: {
    llm: Number,
    final: Number
  },
  fat: {
    llm: Number,
    final: Number
  }
}, { _id: false });

const quantitySchema = new mongoose.Schema({
  value: Number,
  unit: String,
  normalized: {
    value: Number,
    unit: String
  }
}, { _id: false });

const itemQuantitySchema = new mongoose.Schema({
  llm: quantitySchema,
  final: {
    value: Number,
    unit: String
  }
}, { _id: false });

const itemSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  name: {
    llm: String,
    final: String
  },
  quantity: itemQuantitySchema,
  nutrition: nutritionSchema,
  confidence: Number
}, { _id: false });

const photoSchema = new mongoose.Schema({
  url: String,
  width: Number,
  height: Number
}, { _id: false });

const mealSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  capturedAt: {
    type: Date,
    required: true,
    index: true
  },
  photos: [photoSchema],
  llmVersion: String,
  llmModel: String,
  name: String,
  totalNutrition: nutritionSchema,
  items: [itemSchema],
  notes: String,
  userApproved: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
mealSchema.index({ userId: 1, capturedAt: -1 });

module.exports = mongoose.model('Meal', mealSchema, 'meals'); 