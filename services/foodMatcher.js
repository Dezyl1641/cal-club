const FoodItem = require('../models/schemas/FoodItem');
const vectorSearchService = require('./vectorSearchService');

/**
 * Escape special regex characters in user input to prevent regex injection
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strategy 1: Exact match (case-sensitive)
 */
async function exactMatch(foodName) {
  const food = await FoodItem.findOne({ name: foodName });
  if (food) {
    return { food, confidence: 1.0, strategy: 'exact' };
  }
  return null;
}

/**
 * Strategy 2: Case-insensitive match
 */
async function caseInsensitiveMatch(foodName) {
  const escaped = escapeRegex(foodName);
  const food = await FoodItem.findOne({
    name: { $regex: new RegExp(`^${escaped}$`, 'i') }
  });
  if (food) {
    return { food, confidence: 0.95, strategy: 'case_insensitive' };
  }
  return null;
}

/**
 * Strategy 3: Case-insensitive match against FoodItem.aliases array
 */
async function aliasFieldMatch(foodName) {
  const escaped = escapeRegex(foodName);
  const food = await FoodItem.findOne({
    aliases: { $regex: new RegExp(`^${escaped}$`, 'i') }
  });
  if (food) {
    return { food, confidence: 0.92, strategy: 'alias_field', matchedAlias: foodName };
  }
  return null;
}

/**
 * Main waterfall matching function
 * Tries strategies in order until a match is found
 * @param {string} foodName - Name of the food to match
 * @param {string} category - Optional category filter (protein, grain, etc.)
 * @param {number} confidenceThreshold - Minimum confidence to accept (0-1)
 * @returns {Object|null} Match result with food, confidence, strategy
 */
async function matchFood(foodName, category = null, confidenceThreshold = 0.7) {
  if (!foodName || typeof foodName !== 'string') {
    return null;
  }

  const trimmedName = foodName.trim();
  if (!trimmedName) {
    return null;
  }

  // Try strategies in order
  const strategies = [
    () => exactMatch(trimmedName),
    () => caseInsensitiveMatch(trimmedName),
    () => aliasFieldMatch(trimmedName),
    () => vectorSearchService.semanticSearch(trimmedName, category, 5),
  ];

  for (const strategy of strategies) {
    try {
      const result = await strategy();

      // Handle both single result and array of results (from semantic search)
      const matchResult = Array.isArray(result) ? result[0] : result;

      if (matchResult && matchResult.confidence >= confidenceThreshold) {
        // Fire-and-forget usageCount increment (non-blocking)
        if (matchResult.food && matchResult.food._id) {
          FoodItem.findByIdAndUpdate(
            matchResult.food._id,
            { $inc: { usageCount: 1 } },
            { new: false }
          ).exec().catch(saveErr => {
            console.warn(`Failed to update usageCount for ${matchResult.food.name}:`, saveErr.message);
          });
        }
        return matchResult;
      }
    } catch (err) {
      console.error(`Error in matching strategy:`, err);
    }
  }

  return null;
}

/**
 * Batch exact match: look up multiple food names in a single DB query.
 * Returns a Map of foodName → { food, confidence, strategy }.
 * Only finds exact (case-sensitive) matches. Remaining items need per-item waterfall.
 */
async function batchExactMatch(foodNames) {
  const results = new Map();
  if (!foodNames || foodNames.length === 0) return results;

  const trimmed = foodNames.map(n => n.trim()).filter(Boolean);
  const foods = await FoodItem.find({ name: { $in: trimmed } });

  for (const food of foods) {
    results.set(food.name, { food, confidence: 1.0, strategy: 'batch_exact' });
    // Fire-and-forget usageCount increment
    FoodItem.findByIdAndUpdate(food._id, { $inc: { usageCount: 1 } }, { new: false })
      .exec().catch(() => {});
  }

  return results;
}

module.exports = {
  matchFood,
  batchExactMatch,
};
