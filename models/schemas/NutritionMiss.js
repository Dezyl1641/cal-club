const mongoose = require('mongoose');

const nutritionMissSchema = new mongoose.Schema({
  itemName: { type: String, required: true },
  quantity: String,
  llmNutrition: {
    calories: Number,
    protein: Number,
    carbs: Number,
    fat: Number
  },
  occurrenceCount: { type: Number, default: 1 },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  addedToDb: { type: Boolean, default: false }
}, { timestamps: true });

nutritionMissSchema.index({ itemName: 1 });

module.exports = mongoose.model('NutritionMiss', nutritionMissSchema, 'nutrition_misses');
