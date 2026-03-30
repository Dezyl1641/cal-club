/**
 * testWaterfall.js
 *
 * End-to-end test of the V4 nutrition waterfall:
 *   1. DB match (curated items via semantic search)
 *   2. LLM fallback (Gemini estimates nutrition, caches as FoodItem)
 *   3. LLM-cached hit (second lookup for same item hits DB)
 *
 * Usage: node Backend/scripts/testWaterfall.js
 */

const mongoose = require('mongoose');
require('dotenv').config();
const { dbLookup, calculateNutrition } = require('../services/nutritionLookupServiceV4');

const MONGO_URI = process.env.MONGO_URI_NEW || process.env.MONGO_URI;

// Test cases: actual Gemini output names → should match curated DB
const dbMatchTests = [
  { name: 'Grilled Chicken', category: 'protein', grams: 120 },
  { name: 'Cooked White Rice', category: 'grain', grams: 150 },
  { name: 'Dal (Lentil Curry)', category: 'legumes', grams: 200 },
  { name: 'Roti (Wheat Flatbread)', category: 'grain', grams: 40 },
  { name: 'Butter Chicken Gravy', category: 'sauce', grams: 150 },
  { name: 'Dahi (Plain Yogurt)', category: 'dairy', grams: 100 },
  { name: 'Mixed Green Salad', category: 'vegetable', grams: 80 },
  { name: 'Banana', category: 'fruit', grams: 120 },
  { name: 'Paneer (Indian Cottage Cheese)', category: 'dairy', grams: 100 },
  { name: 'Olive Oil', category: 'fat', grams: 10 },
];

// Test case for LLM fallback: obscure item unlikely to be in DB
const llmFallbackTest = {
  name: 'Dragon Fruit Smoothie Bowl with Chia Seeds',
  category: 'other',
  grams: 250
};

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  // ── Test 1: DB matches ──
  console.log('═══ TEST 1: Database Match (Curated Items) ═══\n');
  let dbHits = 0;
  let dbMisses = 0;

  for (const item of dbMatchTests) {
    const start = Date.now();
    const result = await dbLookup(item);
    const ms = Date.now() - start;

    if (result.nutritionSource === 'db' || result.nutritionSource === 'llm_cached') {
      dbHits++;
      console.log(`  ✅ "${item.name}" → ${result.matchedName} (${result.strategy}, ${result.confidence}, ${ms}ms)`);
      console.log(`     ${result.nutrition.calories} cal | ${result.nutrition.protein}g P | ${result.nutrition.carbs}g C | ${result.nutrition.fat}g F`);
    } else {
      dbMisses++;
      console.log(`  ❌ "${item.name}" → ${result.nutritionSource} (${ms}ms)`);
      if (result.error) console.log(`     Error: ${result.error}`);
    }
  }

  console.log(`\n  DB Match Rate: ${dbHits}/${dbMatchTests.length} (${Math.round(dbHits/dbMatchTests.length*100)}%)\n`);

  // ── Test 2: LLM Fallback ──
  console.log('═══ TEST 2: LLM Fallback (Unknown Item) ═══\n');

  // First, check if this item already exists (from a previous test run)
  const FoodItem = require('../models/schemas/FoodItem');
  const existing = await FoodItem.findOne({ name: llmFallbackTest.name });
  if (existing) {
    console.log(`  ⚠️  Cleaning up previous test item "${llmFallbackTest.name}"`);
    await FoodItem.deleteOne({ _id: existing._id });
  }

  const start2 = Date.now();
  const llmBatchResult = await calculateNutrition([llmFallbackTest]);
  const ms2 = Date.now() - start2;
  const llmItem = llmBatchResult.items[0];

  if (llmItem.nutritionSource === 'llm_fresh') {
    console.log(`  ✅ LLM fallback worked! (${ms2}ms)`);
    console.log(`     "${llmFallbackTest.name}" → ${llmItem.nutrition.calories} cal | ${llmItem.nutrition.protein}g P | ${llmItem.nutrition.carbs}g C | ${llmItem.nutrition.fat}g F`);
    console.log(`     Cached as FoodItem: ${llmItem.foodItemId}`);
  } else {
    console.log(`  ❌ LLM fallback failed: ${llmItem.nutritionSource}`);
    if (llmItem.error) console.log(`     Error: ${llmItem.error}`);
  }

  // ── Test 3: LLM-cached hit ──
  console.log('\n═══ TEST 3: LLM-Cached Hit (Second Lookup) ═══\n');

  if (llmItem.nutritionSource === 'llm_fresh') {
    const start3 = Date.now();
    const cachedBatchResult = await calculateNutrition([llmFallbackTest]);
    const ms3 = Date.now() - start3;
    const cachedItem = cachedBatchResult.items[0];

    if (cachedItem.nutritionSource === 'llm_cached') {
      console.log(`  ✅ Cache hit! (${ms3}ms vs ${ms2}ms for fresh)`);
      console.log(`     "${llmFallbackTest.name}" → ${cachedItem.matchedName} (${cachedItem.strategy})`);
    } else if (cachedItem.nutritionSource === 'db') {
      console.log(`  ✅ DB hit (same as cache hit)! (${ms3}ms)`);
      console.log(`     "${llmFallbackTest.name}" → ${cachedItem.matchedName} (${cachedItem.strategy})`);
    } else {
      console.log(`  ❌ Expected llm_cached, got: ${cachedItem.nutritionSource}`);
    }

    // Clean up test item
    await FoodItem.deleteOne({ name: llmFallbackTest.name });
    console.log(`\n  🧹 Cleaned up test item`);
  } else {
    console.log('  ⏭️  Skipped (LLM fallback failed)\n');
  }

  // ── Test 4: Full meal calculation ──
  console.log('\n═══ TEST 4: Full Meal Calculation ═══\n');

  const mealItems = [
    { name: 'Cooked Chicken Breast', category: 'protein', grams: 150 },
    { name: 'Cooked White Rice', category: 'grain', grams: 200 },
    { name: 'Dal Tadka Gravy', category: 'sauce', grams: 100 },
    { name: 'Roti', category: 'grain', grams: 40 },
  ];

  const start4 = Date.now();
  const mealResult = await calculateNutrition(mealItems);
  const ms4 = Date.now() - start4;

  console.log(`  Total: ${mealResult.totalNutrition.calories} cal | ${mealResult.totalNutrition.protein}g P | ${mealResult.totalNutrition.carbs}g C | ${mealResult.totalNutrition.fat}g F`);
  console.log(`  Coverage: ${mealResult.coverage.fromDatabase} DB + ${mealResult.coverage.fromLLM} LLM + ${mealResult.coverage.errors} errors / ${mealResult.coverage.total} total`);
  console.log(`  Time: ${ms4}ms`);

  for (const item of mealResult.items) {
    const status = item.nutrition ? '✅' : '❌';
    console.log(`    ${status} ${item.name} (${item.grams}g) → ${item.nutritionSource} — ${item.nutrition?.calories || 0} cal`);
  }

  console.log('\n✅ All tests complete');
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
