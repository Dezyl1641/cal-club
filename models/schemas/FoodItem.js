const mongoose = require('mongoose');

const foodItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['PROTEIN', 'GRAVY', 'STANDALONE'], required: true },
  aliases: [String],
  category: String,

  // PROTEIN-specific (per-piece values, null for GRAVY/STANDALONE)
  form: String,
  caloriesPerPiece: Number,
  proteinPerPiece: Number,
  carbsPerPiece: Number,
  fatPerPiece: Number,
  gramsPerPiece: Number,

  // GRAVY and STANDALONE (per-100g values, null for PROTEIN)
  caloriesPer100g: Number,
  proteinPer100g: Number,
  carbsPer100g: Number,
  fatPer100g: Number,

  verified: { type: Boolean, default: false },
  source: String
}, { timestamps: true });

foodItemSchema.index({ name: 1, type: 1 });
foodItemSchema.index({ aliases: 1 });
foodItemSchema.index({ name: 1, form: 1 }, { sparse: true }); // for PROTEIN lookups by name+form

module.exports = mongoose.model('FoodItem', foodItemSchema, 'food_items');
