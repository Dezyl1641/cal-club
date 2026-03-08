const mongoose = require('mongoose');

const unitConversionSchema = new mongoose.Schema({
  itemName: { type: String, required: true },
  displayUnit: { type: String, required: true },
  gramEquivalent: { type: Number, required: true }
}, { timestamps: true });

unitConversionSchema.index({ itemName: 1, displayUnit: 1 }, { unique: true });

module.exports = mongoose.model('UnitConversion', unitConversionSchema, 'unit_conversions');
