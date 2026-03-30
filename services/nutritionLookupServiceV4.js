const { GoogleGenerativeAI } = require('@google/generative-ai');
const FoodItem = require('../models/schemas/FoodItem');
const CompositeDishMapping = require('../models/schemas/CompositeDishMapping');
const { matchFood } = require('./foodMatcher');
const embeddingService = require('./embeddingService');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Try to find a food item in the database.
 * Returns the enriched item if found, or the original item with nutritionSource='db_miss' if not.
 */
async function dbLookup(item) {
  const { name, category, grams } = item;

  if (!name || !grams) {
    return {
      ...item,
      nutrition: null,
      nutritionSource: 'missing',
      error: 'Missing name or grams'
    };
  }

  const matchResult = await matchFood(name, category, 0.80);

  if (matchResult && matchResult.food) {
    const { food, confidence, strategy } = matchResult;
    const multiplier = grams / 100;

    const nutrition = {
      calories: Math.round(food.caloriesPer100g * multiplier),
      protein: Math.round(food.proteinPer100g * multiplier * 10) / 10,
      carbs: Math.round(food.carbsPer100g * multiplier * 10) / 10,
      fat: Math.round(food.fatPer100g * multiplier * 10) / 10,
      fiber: Math.round((food.fiberPer100g || 0) * multiplier * 10) / 10
    };

    const nutritionSource = food.dataSource === 'LLM' ? 'llm_cached' : 'db';

    return {
      ...item,
      foodItemId: food._id,
      matchedName: food.name,
      dataSource: food.dataSource,
      nutrition,
      nutritionSource,
      confidence,
      strategy,
      verified: food.verified
    };
  }

  // No match — mark as db_miss for batch LLM processing
  return { ...item, nutritionSource: 'db_miss' };
}

/**
 * Step 2.25: Decompose composite dishes into components using the mapping collection.
 *
 * Checks each item's name against composite_dish_mappings (by dishName or aliases, case-insensitive).
 * If matched, replaces the single item with multiple component items using ratio-based gram splits.
 *
 * Quantization logic (for eggs etc.):
 *   - Components with quantization: rawGrams rounded to nearest unit (min 1 unit)
 *   - Components with getRemainder: gets totalGrams minus sum of quantized components
 *   - Normal components: totalGrams × ratio
 */
// Module-level cache for composite dish mappings
let mappingsCache = null;
let mappingsCacheTime = 0;
const MAPPINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadMappings() {
  const now = Date.now();
  if (mappingsCache && (now - mappingsCacheTime) < MAPPINGS_CACHE_TTL) {
    return mappingsCache;
  }
  mappingsCache = await CompositeDishMapping.find({}).lean();
  mappingsCacheTime = now;
  return mappingsCache;
}

async function decomposeComposites(items) {
  const mappings = await loadMappings();

  // Build lookup: lowercase name/alias → mapping
  const mappingLookup = new Map();
  for (const m of mappings) {
    mappingLookup.set(m.dishName.toLowerCase(), m);
    for (const alias of (m.aliases || [])) {
      mappingLookup.set(alias.toLowerCase(), m);
    }
  }

  const result = [];

  for (const item of items) {
    const mapping = item.name ? mappingLookup.get(item.name.toLowerCase()) : null;

    if (!mapping) {
      // Not a composite dish — pass through unchanged
      result.push(item);
      continue;
    }

    const totalGrams = item.grams;
    console.log(`[Composite] "${item.name}" (${totalGrams}g) → decomposing into ${mapping.components.length} components`);

    // First pass: quantized components
    const componentGrams = new Map();
    let quantizedTotal = 0;

    for (const comp of mapping.components) {
      if (comp.quantization) {
        const rawGrams = totalGrams * comp.ratio;
        let finalGrams = Math.round(rawGrams / comp.quantization.unit) * comp.quantization.unit;
        finalGrams = Math.max(finalGrams, comp.quantization.unit); // minimum 1 unit
        componentGrams.set(comp.name, finalGrams);
        quantizedTotal += finalGrams;
      }
    }

    // Guard: if quantized total exceeds dish total, fall back to ratio-only
    if (quantizedTotal > totalGrams) {
      console.warn(`[Composite] Quantization overflow for "${item.name}" (${totalGrams}g): quantized=${quantizedTotal}g. Falling back to ratio-only.`);
      componentGrams.clear();
      quantizedTotal = 0;
      for (const comp of mapping.components) {
        componentGrams.set(comp.name, Math.round(totalGrams * comp.ratio));
      }
    } else {
      // Second pass: remainder components
      for (const comp of mapping.components) {
        if (comp.getRemainder) {
          const remainderGrams = totalGrams - quantizedTotal;
          componentGrams.set(comp.name, Math.max(remainderGrams, 0));
        }
      }

      // Third pass: normal components (no quantization, no remainder)
      for (const comp of mapping.components) {
        if (!comp.quantization && !comp.getRemainder) {
          componentGrams.set(comp.name, Math.round(totalGrams * comp.ratio));
        }
      }
    }

    // Create component items
    for (const comp of mapping.components) {
      const grams = componentGrams.get(comp.name);
      console.log(`[Composite]   → "${comp.name}" (${grams}g, category: ${comp.category})`);
      result.push({
        name: comp.name,
        category: comp.category,
        grams,
        parentDish: item.name,
        parentGrams: totalGrams
      });
    }
  }

  return result;
}

/**
 * Ask Gemini to estimate per-100g nutrition for multiple food items in a single call.
 * Returns a map: foodName → { caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g, fiberPer100g }
 */
async function batchLLMNutritionEstimate(foodItems) {
  if (foodItems.length === 0) return {};

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const itemsList = foodItems.map((f, i) =>
    `${i + 1}. "${f.name}" (category: ${f.category || 'unknown'})`
  ).join('\n');

  const prompt = `Estimate the nutrition per 100 grams for each food item below.

${itemsList}

Return ONLY raw JSON, no markdown, no explanation. Use this exact format:
[
  {
    "name": "exact name from above",
    "caloriesPer100g": <number>,
    "proteinPer100g": <number>,
    "carbsPer100g": <number>,
    "fatPer100g": <number>,
    "fiberPer100g": <number>
  }
]

Rules:
- Return one object per item, in the same order as listed above
- Use standard nutritional reference values for cooked/prepared forms
- Be accurate with your estimates`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const llmResults = JSON.parse(jsonStr);

  // Build a map: name → nutrition (match by name, not array position)
  const nutritionMap = {};
  for (const llmData of llmResults) {
    if (llmData && llmData.name && typeof llmData.caloriesPer100g === 'number') {
      // Find the original food item name (case-insensitive match)
      const originalItem = foodItems.find(f => f.name.toLowerCase() === llmData.name.toLowerCase());
      if (originalItem) {
        nutritionMap[originalItem.name] = llmData;
      }
    }
  }

  return nutritionMap;
}

/**
 * Cache LLM-estimated food items to the database with embeddings.
 * Uses bulkWrite to avoid duplicate entries for the same name.
 */
async function cacheLLMResults(nutritionMap, foodItems) {
  const cachedFoods = {};

  // Filter to items that have LLM data
  const itemsToCache = foodItems.filter(f => nutritionMap[f.name]);
  if (itemsToCache.length === 0) return cachedFoods;

  // Generate all embeddings in a single batch call
  const searchTexts = itemsToCache.map(f =>
    embeddingService.getFoodSearchText({
      name: f.name,
      category: f.category || 'other',
      aliases: []
    })
  );

  let embeddings = new Array(itemsToCache.length).fill(null);
  try {
    embeddings = await embeddingService.generateEmbeddingsBatch(searchTexts);
  } catch (embErr) {
    console.warn(`Failed to generate batch embeddings:`, embErr.message);
  }

  const results = itemsToCache.map((f, i) => ({
    name: f.name,
    category: f.category,
    llmData: nutritionMap[f.name],
    embedding: embeddings[i] || null
  }));

  for (const r of results) {
    if (!r) continue;

    const cachedFood = new FoodItem({
      name: r.name,
      aliases: [],
      category: r.category || 'other',
      dataSource: 'LLM',
      verified: false,
      reviewed: false,
      itemType: 'single_item',
      caloriesPer100g: r.llmData.caloriesPer100g,
      proteinPer100g: r.llmData.proteinPer100g,
      carbsPer100g: r.llmData.carbsPer100g,
      fatPer100g: r.llmData.fatPer100g,
      fiberPer100g: r.llmData.fiberPer100g || 0,
      usageCount: 1,
      llmModel: 'gemini-2.5-flash',
      llmGeneratedAt: new Date(),
      embedding: r.embedding,
      embeddingModel: r.embedding ? embeddingService.EMBEDDING_MODEL : null,
      embeddingGeneratedAt: r.embedding ? new Date() : null
    });

    try {
      await cachedFood.save();
      cachedFoods[r.name] = cachedFood;
      console.log(`[LLM Cache] Saved "${r.name}" → ${r.llmData.caloriesPer100g} cal/100g`);
    } catch (saveErr) {
      // Duplicate key — item was already cached (race condition or previous run)
      if (saveErr.code === 11000) {
        const existing = await FoodItem.findOne({ name: r.name });
        if (existing) cachedFoods[r.name] = existing;
      } else {
        console.warn(`Failed to cache "${r.name}":`, saveErr.message);
      }
    }
  }

  return cachedFoods;
}

/**
 * Calculate nutrition for all items in a meal.
 *
 * Flow:
 *   1. Normalize grams from Gemini's quantityAlternate
 *   2. DB lookup all items in parallel
 *   3. Collect unique DB misses
 *   4. One batch LLM call for all misses (instead of N separate calls)
 *   5. Cache new items + apply results back to each item
 */
async function calculateNutrition(items) {
  // Step 1: Normalize grams
  const normalizedItems = items.map(item => {
    if (item.grams) return item;
    const alt = item.quantityAlternate;
    if (alt && alt.value) {
      return { ...item, grams: alt.value };
    }
    return item;
  });

  // Step 2: DB lookup all items in parallel
  const dbResults = await Promise.all(
    normalizedItems.map(item => dbLookup(item))
  );

  // Step 2.25: Decompose composite dishes that were DB misses
  // Items that matched the DB stay as-is; only db_miss items get checked for composite decomposition
  const afterDecomposition = [];
  const compositeMisses = [];
  for (const result of dbResults) {
    if (result.nutritionSource !== 'db_miss') {
      afterDecomposition.push(result);
    } else {
      compositeMisses.push(result);
    }
  }

  if (compositeMisses.length > 0) {
    const decomposed = await decomposeComposites(compositeMisses);
    // Decomposed items need their own DB lookup
    const decomposedResults = await Promise.all(
      decomposed.map(item => {
        // If item has parentDish, it was decomposed from a composite — do fresh DB lookup
        if (item.parentDish) {
          return dbLookup(item);
        }
        // Not decomposed (no mapping match) — keep original db_miss result
        return Promise.resolve(item);
      })
    );
    afterDecomposition.push(...decomposedResults);
  }

  // Step 3: Collect unique DB misses (from post-decomposition results)
  const dbMissNames = new Set();
  const dbMissItems = [];
  for (const result of afterDecomposition) {
    if (result.nutritionSource === 'db_miss' && !dbMissNames.has(result.name)) {
      dbMissNames.add(result.name);
      dbMissItems.push({ name: result.name, category: result.category });
    }
  }

  // Step 4: One batch LLM call for all unique misses
  let nutritionMap = {};
  let cachedFoods = {};
  if (dbMissItems.length > 0) {
    console.log(`[Batch LLM] ${dbMissItems.length} unique DB misses: ${dbMissItems.map(f => f.name).join(', ')}`);
    try {
      nutritionMap = await batchLLMNutritionEstimate(dbMissItems);
      cachedFoods = await cacheLLMResults(nutritionMap, dbMissItems);
    } catch (err) {
      console.error(`[Batch LLM Error]:`, err.message);
    }
  }

  // Step 5: Apply LLM results to all db_miss items
  const processedItems = afterDecomposition.map(result => {
    if (result.nutritionSource !== 'db_miss') return result;

    const llmData = nutritionMap[result.name];
    if (!llmData) {
      return {
        ...result,
        nutrition: null,
        nutritionSource: 'llm_error',
        confidence: 0,
        error: 'LLM batch estimation failed for this item'
      };
    }

    const multiplier = result.grams / 100;
    const nutrition = {
      calories: Math.round(llmData.caloriesPer100g * multiplier),
      protein: Math.round(llmData.proteinPer100g * multiplier * 10) / 10,
      carbs: Math.round(llmData.carbsPer100g * multiplier * 10) / 10,
      fat: Math.round(llmData.fatPer100g * multiplier * 10) / 10,
      fiber: Math.round((llmData.fiberPer100g || 0) * multiplier * 10) / 10
    };

    const cached = cachedFoods[result.name];
    return {
      ...result,
      foodItemId: cached ? cached._id : null,
      matchedName: result.name,
      dataSource: 'LLM',
      nutrition,
      nutritionSource: 'llm_fresh',
      confidence: 0.7,
      verified: false
    };
  });

  // Calculate totals
  const totalNutrition = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const sourceBreakdown = { db: 0, llm_cached: 0, llm_fresh: 0, llm_error: 0, missing: 0 };

  for (const item of processedItems) {
    if (item.nutrition) {
      totalNutrition.calories += item.nutrition.calories || 0;
      totalNutrition.protein += item.nutrition.protein || 0;
      totalNutrition.carbs += item.nutrition.carbs || 0;
      totalNutrition.fat += item.nutrition.fat || 0;
      totalNutrition.fiber += item.nutrition.fiber || 0;
    }

    const source = item.nutritionSource || 'missing';
    sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
  }

  totalNutrition.calories = Math.round(totalNutrition.calories);
  totalNutrition.protein = Math.round(totalNutrition.protein * 10) / 10;
  totalNutrition.carbs = Math.round(totalNutrition.carbs * 10) / 10;
  totalNutrition.fat = Math.round(totalNutrition.fat * 10) / 10;
  totalNutrition.fiber = Math.round(totalNutrition.fiber * 10) / 10;

  return {
    items: processedItems,
    totalNutrition,
    sourceBreakdown,
    coverage: {
      total: processedItems.length,
      fromDatabase: sourceBreakdown.db + sourceBreakdown.llm_cached,
      fromLLM: sourceBreakdown.llm_fresh,
      errors: sourceBreakdown.llm_error + sourceBreakdown.missing
    }
  };
}

module.exports = {
  calculateNutrition,
  dbLookup,
  batchLLMNutritionEstimate
};
