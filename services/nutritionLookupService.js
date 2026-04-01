const FoodItem = require('../models/schemas/FoodItem');
const UnitConversion = require('../models/schemas/UnitConversion');
const NutritionMiss = require('../models/schemas/NutritionMiss');

/**
 * Nutrition Lookup Service - Step 2 of the V3 food recognition pipeline.
 * Replaces LLM calorie calculation with database lookup from verified sources (USDA, INDB).
 * Falls back to LLM when no DB match is found.
 */

/**
 * Parse "Component (parent dish)" format from item name.
 * Only treats as composite if the parenthesized part looks like an actual dish name,
 * NOT a container/descriptor like "jar", "bottle", "box", "pack", "can", "cup", etc.
 * @returns { { component: string, parentDish: string } | null }
 */
function parseCompositeName(name) {
  const match = name.match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (!match) return null;
  const parentDish = match[2].trim();
  const containerWords = /^(jar|bottle|box|pack|packet|can|cup|glass|bowl|plate|bag|pouch|tin|container|carton|sachet|tube|tub|bar|small|medium|large)$/i;
  if (containerWords.test(parentDish)) return null;
  return { component: match[1].trim(), parentDish };
}

/**
 * Normalize unit string for lookup. Tries variations like "1 cup", "cup", "cups".
 */
function normalizeUnitForLookup(value, unit) {
  const u = (unit || '').trim().toLowerCase();
  const variations = [u];
  if (u && !/^\d/.test(u)) variations.push(`1 ${u}`);
  const singular = u.replace(/s$/, ''); // "cups" -> "cup"
  if (singular !== u) variations.push(singular, `1 ${singular}`);
  return variations;
}

/**
 * Get gram equivalent for a display unit. Tries itemName + displayUnit variations.
 */
async function getGramEquivalent(itemName, value, unit) {
  const variations = normalizeUnitForLookup(value, unit);
  for (const v of variations) {
    const conv = await UnitConversion.findOne({
      itemName: new RegExp(`^${escapeRegex(itemName)}$`, 'i'),
      displayUnit: new RegExp(`^${escapeRegex(v)}$`, 'i')
    });
    if (conv) return conv.gramEquivalent * (value || 1);
  }
  // Try generic unit mappings (e.g. "1 cup" = 180g for rice, 250g for liquid)
  const genericUnits = {
    'cup': 180, 'cups': 180,
    'small bowl': 150, 'medium bowl': 250, 'large bowl': 400,
    'glass': 250, 'tbsp': 15, 'tablespoon': 15
  };
  const key = (unit || '').toLowerCase().trim();
  if (genericUnits[key] !== undefined) return genericUnits[key] * (value || 1);
  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract protein form from quantity unit. E.g. "5 boneless pieces" -> form "boneless piece"
 */
function parseProteinForm(unit) {
  const u = (unit || '').toLowerCase();
  const formMap = {
    'boneless piece': 'boneless piece', 'boneless pieces': 'boneless piece',
    'bone-in piece': 'bone-in piece', 'bone-in pieces': 'bone-in piece',
    'drumstick': 'drumstick', 'drumsticks': 'drumstick',
    'fillet': 'fillet', 'fillets': 'fillet',
    'cube': 'cube', 'cubes': 'cube',
    'whole': 'whole',
    'piece': 'piece', 'pieces': 'piece',
    'prawn': 'prawn', 'prawns': 'prawn'
  };
  for (const [key, form] of Object.entries(formMap)) {
    if (u.includes(key)) return form;
  }
  return 'piece'; // default
}

/**
 * Look up PROTEIN type FoodItem by component name and form.
 * Tries exact match first, then DB-name-starts-with, then prefix match.
 */
async function matchProtein(componentName, form) {
  const name = (componentName || '').trim().toLowerCase();
  const nameEscaped = escapeRegex(name);
  const f = form || 'piece';

  // Exact name + form
  let doc = await FoodItem.findOne({
    name: new RegExp(`^${nameEscaped}$`, 'i'),
    type: 'PROTEIN', form: f
  });
  if (doc) return doc;

  // Exact name, any form
  doc = await FoodItem.findOne({
    name: new RegExp(`^${nameEscaped}$`, 'i'),
    type: 'PROTEIN'
  });
  if (doc) return doc;

  // DB name starts with search term
  doc = await FoodItem.findOne({
    name: new RegExp(`^${nameEscaped}\\b`, 'i'),
    type: 'PROTEIN'
  });
  if (doc) {
    console.log(`📊 [NutritionLookup]     fuzzy protein: "${name}" → DB "${doc.name}"`);
    return doc;
  }

  // Alias match
  doc = await FoodItem.findOne({
    aliases: new RegExp(`^${nameEscaped}$`, 'i'),
    type: 'PROTEIN'
  });
  return doc;
}

/**
 * Look up GRAVY type FoodItem. Parent dish maps to "X gravy" e.g. "butter chicken" -> "butter chicken gravy"
 */
async function matchGravy(parentDish) {
  const name = (parentDish || '').trim().toLowerCase();
  const gravyName = name.includes('gravy') ? name : `${name} gravy`;
  return FoodItem.findOne({
    $or: [
      { name: new RegExp(`^${escapeRegex(gravyName)}$`, 'i'), type: 'GRAVY' },
      { name: new RegExp(`^${escapeRegex(name)}$`, 'i'), type: 'GRAVY' }
    ]
  });
}

/**
 * Look up STANDALONE type FoodItem. Matching strategy (in order):
 * 1. Exact name match
 * 2. Exact alias match
 * 3. DB name starts with search term (e.g., "omelette" → "omelette plain")
 * 4. Search term starts with DB name (e.g., "mixed greens salad" → "mixed greens")
 * 5. Strip common suffixes/prefixes and retry (e.g., "cherry tomatoes" → "tomato")
 */
async function matchStandalone(itemName) {
  const name = (itemName || '').trim().toLowerCase();
  const nameEscaped = escapeRegex(name);
  // 1. Exact name
  let doc = await FoodItem.findOne({
    name: new RegExp(`^${nameEscaped}$`, 'i'),
    type: 'STANDALONE'
  });
  if (doc) return doc;

  // 2. Exact alias
  doc = await FoodItem.findOne({
    aliases: new RegExp(`^${nameEscaped}$`, 'i'),
    type: 'STANDALONE'
  });
  if (doc) return doc;

  // 3. DB name starts with the search term (LLM said "omelette", DB has "omelette plain")
  doc = await FoodItem.findOne({
    name: new RegExp(`^${nameEscaped}\\b`, 'i'),
    type: 'STANDALONE'
  });
  if (doc) {
    console.log(`📊 [NutritionLookup]     fuzzy: "${name}" → DB "${doc.name}" (DB starts with search)`);
    return doc;
  }

  // 4. Search term starts with DB name (LLM said "smoked salmon fillet", DB has "smoked salmon")
  //    Use $where or text match — but simpler: search for each word-prefix combo
  const words = name.split(/\s+/);
  if (words.length > 1) {
    for (let len = words.length - 1; len >= 1; len--) {
      const prefix = words.slice(0, len).join(' ');
      doc = await FoodItem.findOne({
        name: new RegExp(`^${escapeRegex(prefix)}$`, 'i'),
        type: 'STANDALONE'
      });
      if (doc) {
        console.log(`📊 [NutritionLookup]     fuzzy: "${name}" → DB "${doc.name}" (prefix "${prefix}")`);
        return doc;
      }
      // Also check aliases for the prefix
      doc = await FoodItem.findOne({
        aliases: new RegExp(`^${escapeRegex(prefix)}$`, 'i'),
        type: 'STANDALONE'
      });
      if (doc) {
        console.log(`📊 [NutritionLookup]     fuzzy: "${name}" → DB "${doc.name}" (alias prefix "${prefix}")`);
        return doc;
      }
    }
  }

  // 5. Singularize and retry (e.g., "cherry tomatoes" → "cherry tomato", "tomatoes" → "tomato")
  const singular = name.replace(/ies$/, 'y').replace(/es$/, 'e').replace(/s$/, '');
  if (singular !== name) {
    doc = await FoodItem.findOne({
      $or: [
        { name: new RegExp(`^${escapeRegex(singular)}$`, 'i') },
        { name: new RegExp(`^${escapeRegex(singular)}\\b`, 'i') },
        { aliases: new RegExp(`^${escapeRegex(singular)}$`, 'i') }
      ],
      type: 'STANDALONE'
    });
    if (doc) {
      console.log(`📊 [NutritionLookup]     fuzzy: "${name}" → DB "${doc.name}" (singularized "${singular}")`);
      return doc;
    }
  }

  return null;
}

/**
 * Log a nutrition miss for future DB expansion.
 */
async function logNutritionMiss(itemName, quantity, llmNutrition) {
  try {
    await NutritionMiss.findOneAndUpdate(
      { itemName: itemName.trim() },
      {
        $set: { quantity, llmNutrition, lastSeenAt: new Date() },
        $inc: { occurrenceCount: 1 },
        $setOnInsert: { firstSeenAt: new Date() }
      },
      { upsert: true }
    );
  } catch (e) {
    console.error('[NutritionLookup] Failed to log NutritionMiss:', e.message);
  }
}

/**
 * LLM fallback for a single item. Returns nutrition or null.
 * NOTE: No longer called from calculateNutrition (V3 uses all-or-nothing strategy).
 * Kept for backwards compatibility with other callers.
 */
async function llmFallbackForItem(name, value, unit, mealName) {
  const AiService = require('./aiService');
  const quantityStr = value != null && unit ? `${value} ${unit}` : '1 serving';
  try {
    const result = await AiService.analyzeFoodItemWithGemini(name, mealName || 'Meal', '', quantityStr);
    let parsed;
    try {
      parsed = typeof result.response === 'string' ? JSON.parse(result.response.replace(/```json\n?|\n?```/g, '').trim()) : result.response;
    } catch (_) {
      return null;
    }
    if (parsed && parsed.nutrition) {
      return {
        nutrition: parsed.nutrition,
        grams: null,
        nutritionSource: 'llm_fallback'
      };
    }
  } catch (e) {
    console.error('[NutritionLookup] LLM fallback failed for', name, e.message);
  }
  return null;
}

/**
 * Calculate nutrition from grams + per-100g values.
 */
function nutritionFromPer100g(doc, grams) {
  const factor = grams / 100;
  return {
    calories: Math.round((doc.caloriesPer100g || 0) * factor),
    protein: parseFloat(((doc.proteinPer100g || 0) * factor).toFixed(1)),
    carbs: parseFloat(((doc.carbsPer100g || 0) * factor).toFixed(1)),
    fat: parseFloat(((doc.fatPer100g || 0) * factor).toFixed(1))
  };
}

/**
 * Try to resolve a single item from DB only (no LLM fallback).
 * Returns result with nutritionSource='db' if found, or nutritionSource=null if not.
 */
async function tryResolveFromDb(item, proteinWeightsByParent) {
  const name = item.name;
  const qty = item.quantity || {};
  const value = qty.value != null ? qty.value : 1;
  const unit = (qty.unit || 'serving').toString();
  const altGrams = item.quantityAlternate?.value || null;

  console.log(`📊 [NutritionLookup] DB lookup: "${name}" | qty=${value} ${unit} | altGrams=${altGrams || 'N/A'}`);

  const parsed = parseCompositeName(name);

  // Composite with parentheses
  if (parsed) {
    const gravyDoc = await matchGravy(parsed.parentDish);
    if (gravyDoc) {
      const componentLower = parsed.component.toLowerCase();
      const isGravy = /gravy|sauce|curry|dal/.test(componentLower) && !/chicken|paneer|fish|meat|egg|tofu|prawn/.test(componentLower);
      const isProtein = !isGravy;

      if (isProtein) {
        const form = parseProteinForm(unit);
        const proteinDoc = await matchProtein(parsed.component, form);
        if (proteinDoc) {
          if (altGrams && proteinDoc.caloriesPer100g) {
            console.log(`📊 [NutritionLookup]   ✅ composite protein "${parsed.component}" via altGrams(${altGrams}g) + per100g`);
            return {
              name, quantity: qty, quantityAlternate: item.quantityAlternate,
              nutrition: nutritionFromPer100g(proteinDoc, altGrams),
              grams: altGrams, nutritionSource: 'db',
              parentDish: parsed.parentDish, componentType: 'protein', proteinForm: form
            };
          }
          const count = value;
          const grams = count * (proteinDoc.gramsPerPiece || 30);
          console.log(`📊 [NutritionLookup]   ✅ composite protein "${parsed.component}" via per-piece (${count} x ${proteinDoc.gramsPerPiece || 30}g)`);
          return {
            name, quantity: qty, quantityAlternate: item.quantityAlternate,
            nutrition: {
              calories: Math.round(count * (proteinDoc.caloriesPerPiece || 0)),
              protein: parseFloat((count * (proteinDoc.proteinPerPiece || 0)).toFixed(1)),
              carbs: parseFloat((count * (proteinDoc.carbsPerPiece || 0)).toFixed(1)),
              fat: parseFloat((count * (proteinDoc.fatPerPiece || 0)).toFixed(1))
            },
            grams, nutritionSource: 'db',
            parentDish: parsed.parentDish, componentType: 'protein', proteinForm: form
          };
        }
        // Protein component not found in DB
        console.log(`📊 [NutritionLookup]   ❌ composite protein "${parsed.component}" not in DB`);
        return { name, quantity: qty, quantityAlternate: item.quantityAlternate, nutritionSource: null };
      } else {
        // Gravy
        if (altGrams && gravyDoc.caloriesPer100g) {
          console.log(`📊 [NutritionLookup]   ✅ composite gravy "${parsed.parentDish}" via altGrams(${altGrams}g) + per100g`);
          return {
            name, quantity: qty, quantityAlternate: item.quantityAlternate,
            nutrition: nutritionFromPer100g(gravyDoc, altGrams),
            grams: altGrams, nutritionSource: 'db',
            parentDish: parsed.parentDish, componentType: 'gravy', proteinForm: null
          };
        }
        const bowlGrams = await getGramEquivalent(`${parsed.parentDish} gravy`, value, unit)
          || await getGramEquivalent(parsed.parentDish, value, unit)
          || (unit.includes('small') ? 150 : unit.includes('large') ? 400 : 250);
        const proteinWeight = proteinWeightsByParent[parsed.parentDish] || 0;
        const gravyGrams = Math.max(0, bowlGrams - proteinWeight);
        console.log(`📊 [NutritionLookup]   ✅ composite gravy "${parsed.parentDish}" via volume (${gravyGrams}g)`);
        return {
          name, quantity: qty, quantityAlternate: item.quantityAlternate,
          nutrition: nutritionFromPer100g(gravyDoc, gravyGrams),
          grams: gravyGrams, nutritionSource: 'db',
          parentDish: parsed.parentDish, componentType: 'gravy', proteinForm: null
        };
      }
    }
    // Composite but no gravy doc — try as standalone below
  }

  // Standalone lookup — strip parenthesized descriptors for cleaner matching
  const cleanName = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const lookupName = parsed ? parsed.component : cleanName;
  let doc = await matchStandalone(lookupName);
  if (!doc && lookupName !== cleanName) {
    doc = await matchStandalone(cleanName);
  }
  if (!doc && cleanName !== name) {
    doc = await matchStandalone(name);
  }

  // Type-agnostic fallback — item might be stored as PROTEIN/GRAVY but referenced without composite syntax
  if (!doc) {
    const searchName = escapeRegex(cleanName.toLowerCase());
    doc = await FoodItem.findOne({
      $or: [
        { name: new RegExp(`^${searchName}$`, 'i') },
        { name: new RegExp(`^${searchName}\\b`, 'i') },
        { aliases: new RegExp(`^${searchName}$`, 'i') }
      ]
    });
    if (doc) {
      console.log(`📊 [NutritionLookup]     type-agnostic: "${name}" → DB "${doc.name}" (${doc.type})`);
    }
  }

  if (!doc || (!doc.caloriesPer100g && !doc.caloriesPerPiece)) {
    console.log(`📊 [NutritionLookup]   ❌ "${name}" not in DB (doc=${doc ? doc.name : 'null'})`);
    await logNutritionMiss(name, `${value} ${unit}`, null);
    return { name, quantity: qty, quantityAlternate: item.quantityAlternate, nutritionSource: null };
  }

  // First preference: altGrams + per100g
  if (altGrams && doc.caloriesPer100g) {
    console.log(`📊 [NutritionLookup]   ✅ standalone "${name}" via altGrams(${altGrams}g) + per100g | DB: ${doc.name} (${doc.type})`);
    return {
      name, quantity: qty, quantityAlternate: item.quantityAlternate,
      nutrition: nutritionFromPer100g(doc, altGrams),
      grams: altGrams, nutritionSource: 'db',
      parentDish: null, componentType: null, proteinForm: null
    };
  }

  // Fallback: per-piece or volume-based
  let grams = null;
  let nutrition;

  if (doc.type === 'PROTEIN' && doc.gramsPerPiece) {
    const form = parseProteinForm(unit);
    const proteinDoc = await matchProtein(doc.name, form) || doc;
    const count = value;
    grams = count * (proteinDoc.gramsPerPiece || 30);
    console.log(`📊 [NutritionLookup]   ✅ standalone "${name}" via per-piece (${count} x ${proteinDoc.gramsPerPiece || 30}g)`);
    nutrition = {
      calories: Math.round(count * (proteinDoc.caloriesPerPiece || 0)),
      protein: parseFloat((count * (proteinDoc.proteinPerPiece || 0)).toFixed(1)),
      carbs: parseFloat((count * (proteinDoc.carbsPerPiece || 0)).toFixed(1)),
      fat: parseFloat((count * (proteinDoc.fatPerPiece || 0)).toFixed(1))
    };
  } else {
    grams = await getGramEquivalent(doc.name, value, unit)
      || await getGramEquivalent(name, value, unit);
    if (!grams) grams = 100;
    console.log(`📊 [NutritionLookup]   ✅ standalone "${name}" via volume (${grams}g) | DB: ${doc.name} (${doc.type})`);
    nutrition = nutritionFromPer100g(doc, grams);
  }

  return {
    name, quantity: qty, quantityAlternate: item.quantityAlternate,
    nutrition, grams, nutritionSource: 'db',
    parentDish: null, componentType: null, proteinForm: null
  };
}

/**
 * Main entry: try to calculate nutrition for ALL items from DB.
 * All-or-nothing strategy: if every item resolves from DB, returns { allFromDb: true, ... }.
 * If ANY item misses, returns { allFromDb: false, missedItems: [...] } — caller should
 * fall back to a single LLM call for all items.
 *
 * @param {Object} step1Result - { mealName, items: [{ name, quantity: { value, unit }, quantityAlternate }] }
 * @returns {Object} - { mealName, items: [...], allFromDb: boolean, missedItems?: string[] }
 */
async function calculateNutrition(step1Result) {
  const mealName = step1Result.mealName || 'Meal';
  const items = step1Result.items || [];

  if (items.length === 0) {
    return { mealName, items: [], allFromDb: true };
  }

  console.log(`📊 [NutritionLookup] ─── Starting DB lookup for ${items.length} items ───`);

  const proteinWeightsByParent = {};
  const results = [];

  // Phase 1: Try DB for every item (no LLM calls)
  for (const item of items) {
    const result = await tryResolveFromDb(item, proteinWeightsByParent);
    // Track protein weights for gravy subtraction
    if (result.nutritionSource === 'db' && result.componentType === 'protein' && result.parentDish) {
      proteinWeightsByParent[result.parentDish] = (proteinWeightsByParent[result.parentDish] || 0) + (result.grams || 0);
    }
    results.push(result);
  }

  // Phase 2: Check if all resolved
  const missedItems = results.filter(r => r.nutritionSource === null).map(r => r.name);
  const allFromDb = missedItems.length === 0;

  if (allFromDb) {
    console.log(`📊 [NutritionLookup] ✅ All ${items.length} items resolved from DB`);
  } else {
    console.log(`📊 [NutritionLookup] ❌ ${missedItems.length}/${items.length} items NOT in DB: ${JSON.stringify(missedItems)}`);
    console.log(`📊 [NutritionLookup] Caller should fall back to single LLM call for ALL items`);
  }

  return { mealName, items: allFromDb ? results : [], allFromDb, missedItems };
}

module.exports = { calculateNutrition };
