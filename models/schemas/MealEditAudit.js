const mongoose = require('mongoose');

/**
 * Schema for tracking changes to individual fields
 */
const changeSchema = new mongoose.Schema({
  itemId: {
    type: String,
    required: true
  },
  field: {
    type: String,
    required: true,
    enum: ['name', 'quantity', 'calories', 'protein', 'carbs', 'fat', 'mealName']
  },
  previousValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed
}, { _id: false });

/**
 * Schema for LLM input details
 */
const llmInputSchema = new mongoose.Schema({
  requestPayload: mongoose.Schema.Types.Mixed, // Raw request data from client
  promptSent: String,                          // Actual prompt sent to LLM
  provider: {
    type: String,
    enum: ['gemini', 'openai']
  },
  model: String                                // e.g., 'gemini-2.5-flash', 'gpt-4o'
}, { _id: false });

/**
 * Schema for LLM output details
 */
const llmOutputSchema = new mongoose.Schema({
  rawResponse: String,                         // Raw LLM response string
  parsedResponse: mongoose.Schema.Types.Mixed, // Parsed JSON from LLM
  tokensUsed: {
    input: Number,
    output: Number,
    total: Number
  },
  latencyMs: Number                            // Response time in milliseconds
}, { _id: false });

/**
 * Schema for meal state snapshots
 */
const mealSnapshotSchema = new mongoose.Schema({
  name: String,
  totalNutrition: mongoose.Schema.Types.Mixed,
  items: [mongoose.Schema.Types.Mixed]
}, { _id: false });

/**
 * Main MealEditAudit schema
 * Captures complete audit trail for meal edits
 */
const mealEditAuditSchema = new mongoose.Schema({
  mealId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meal',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  editType: {
    type: String,
    required: true,
    enum: [
      'QUANTITY_UPDATE',      // User changed quantity only
      'ITEM_NAME_UPDATE',     // User changed item name (triggers LLM)
      'NUTRITION_UPDATE',     // User directly edited nutrition values
      'BULK_UPDATE',          // Multiple items updated at once
      'ITEM_DELETE',          // Item deleted from meal
      'ITEM_ADD'              // Item added to meal
    ]
  },
  
  // LLM interaction details (only populated when LLM is called)
  llmInput: llmInputSchema,
  llmOutput: llmOutputSchema,
  
  // Field-level changes
  changes: [changeSchema],
  
  // Full meal state before and after
  mealSnapshot: {
    before: mealSnapshotSchema,
    after: mealSnapshotSchema
  },
  
  // Additional metadata
  metadata: {
    ipAddress: String,
    userAgent: String,
    appVersion: String
  },
  
  // Status for tracking processing
  status: {
    type: String,
    enum: ['success', 'failed', 'partial'],
    default: 'success'
  },
  errorMessage: String
}, {
  timestamps: true
});

// Indexes for efficient queries
mealEditAuditSchema.index({ mealId: 1, createdAt: -1 });
mealEditAuditSchema.index({ userId: 1, createdAt: -1 });
mealEditAuditSchema.index({ editType: 1 });
mealEditAuditSchema.index({ 'llmInput.provider': 1 });
mealEditAuditSchema.index({ createdAt: -1 });

// TTL index - optionally auto-delete old audit logs after 1 year (365 days)
// Comment out if you want to keep audit logs forever
// mealEditAuditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });

/**
 * Static method to create audit entry for item name update
 */
mealEditAuditSchema.statics.createItemNameUpdateAudit = async function(data) {
  const audit = new this({
    mealId: data.mealId,
    userId: data.userId,
    editType: 'ITEM_NAME_UPDATE',
    llmInput: data.llmInput,
    llmOutput: data.llmOutput,
    changes: data.changes,
    mealSnapshot: data.mealSnapshot,
    metadata: data.metadata,
    status: data.status || 'success',
    errorMessage: data.errorMessage
  });
  return audit.save();
};

/**
 * Static method to create audit entry for quantity update
 */
mealEditAuditSchema.statics.createQuantityUpdateAudit = async function(data) {
  const audit = new this({
    mealId: data.mealId,
    userId: data.userId,
    editType: 'QUANTITY_UPDATE',
    changes: data.changes,
    mealSnapshot: data.mealSnapshot,
    metadata: data.metadata,
    status: data.status || 'success'
  });
  return audit.save();
};

/**
 * Static method to create audit entry for nutrition update
 */
mealEditAuditSchema.statics.createNutritionUpdateAudit = async function(data) {
  const audit = new this({
    mealId: data.mealId,
    userId: data.userId,
    editType: 'NUTRITION_UPDATE',
    changes: data.changes,
    mealSnapshot: data.mealSnapshot,
    metadata: data.metadata,
    status: data.status || 'success'
  });
  return audit.save();
};

/**
 * Static method to create audit entry for bulk update
 */
mealEditAuditSchema.statics.createBulkUpdateAudit = async function(data) {
  const audit = new this({
    mealId: data.mealId,
    userId: data.userId,
    editType: 'BULK_UPDATE',
    llmInput: data.llmInput,
    llmOutput: data.llmOutput,
    changes: data.changes,
    mealSnapshot: data.mealSnapshot,
    metadata: data.metadata,
    status: data.status || 'success',
    errorMessage: data.errorMessage
  });
  return audit.save();
};

/**
 * Static method to get audit history for a meal
 */
mealEditAuditSchema.statics.getAuditHistory = async function(mealId, options = {}) {
  const { limit = 50, skip = 0, editType = null } = options;
  
  const query = { mealId };
  if (editType) {
    query.editType = editType;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

/**
 * Static method to get audit summary for a user
 */
mealEditAuditSchema.statics.getUserAuditSummary = async function(userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate, $lt: endDate }
      }
    },
    {
      $group: {
        _id: '$editType',
        count: { $sum: 1 },
        avgLatencyMs: { $avg: '$llmOutput.latencyMs' },
        totalTokensUsed: { $sum: '$llmOutput.tokensUsed.total' }
      }
    }
  ]);
};

module.exports = mongoose.model('MealEditAudit', mealEditAuditSchema, 'meal_edit_audits');

