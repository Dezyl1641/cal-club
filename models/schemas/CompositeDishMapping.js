const mongoose = require('mongoose');

const compositeDishMappingSchema = new mongoose.Schema({
  dishName: {
    type: String,
    required: true,
    index: true
  },
  aliases: {
    type: [String],
    default: []
  },
  isComposite: {
    type: Boolean,
    default: true
  },
  components: [{
    name: {
      type: String,
      required: true
    },
    ratio: {
      type: Number,
      required: true
    },
    category: {
      type: String,
      required: true
    },
    quantization: {
      unit: Number,
      method: String
    },
    getRemainder: {
      type: Boolean,
      default: false
    }
  }],
  visibleComponents: {
    type: [String],
    default: []
  },
  gravyType: {
    type: String,
    enum: ['dry', 'semi', 'gravy', null],
    default: null
  },
  totalGrams: {
    type: Number,
    default: null
  },
  reviewed: {
    type: Boolean,
    default: false,
    index: true
  },
  dataSource: {
    type: String,
    enum: ['MANUAL', 'LLM'],
    default: 'MANUAL'
  },
  llmModel: {
    type: String,
    default: null
  },
  llmGeneratedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('CompositeDishMapping', compositeDishMappingSchema, 'composite_dish_mappings');
