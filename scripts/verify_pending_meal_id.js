require('dotenv').config();
const mongoose = require('mongoose');
const Meal = require('../models/schemas/Meal');
const AiService = require('../services/aiService');

const FAKE_USER_ID = new mongoose.Types.ObjectId('ffffffffffffffffffffffff');

// Helper to build a minimal Meal doc for tests.
function buildMealDoc({ pendingMealId, deletedAt = null, name = 'verification-seed' }) {
  return {
    userId: FAKE_USER_ID,
    pendingMealId,
    deletedAt,
    capturedAt: new Date(),
    name,
    items: [],
    totalNutrition: {
      calories: { llm: 100, final: 100 },
      protein: { llm: 5, final: 5 },
      carbs: { llm: 10, final: 10 },
      fat: { llm: 2, final: 2 }
    },
    source: 'llm',
    userApproved: false
  };
}

async function cleanup() {
  await Meal.deleteMany({ userId: FAKE_USER_ID });
}

async function recreateIdempotencyIndex() {
  // The partialFilterExpression changed (now includes deletedAt: null).
  // Drop any existing idempotency index so the new definition takes effect.
  const indexes = await Meal.collection.getIndexes();
  if (indexes['userId_1_pendingMealId_1']) {
    await Meal.collection.dropIndex('userId_1_pendingMealId_1');
    console.log('✓ dropped previous userId_1_pendingMealId_1 index');
  }
  await Meal.collection.createIndex(
    { userId: 1, pendingMealId: 1 },
    {
      unique: true,
      partialFilterExpression: {
        pendingMealId: { $type: 'string' },
        deletedAt: null
      },
      name: 'userId_1_pendingMealId_1'
    }
  );
  console.log('✓ created userId_1_pendingMealId_1 index with deletedAt: null filter');
}

async function testIdempotentShortCircuit() {
  const pendingMealId = `verify-short-${Date.now()}`;
  const seeded = await Meal.create(buildMealDoc({ pendingMealId }));

  const originalAnalyze = AiService.analyzeQuantityWithGeminiV4;
  let geminiCalled = false;
  AiService.analyzeQuantityWithGeminiV4 = async () => {
    geminiCalled = true;
    throw new Error('FAIL: Gemini was invoked but short-circuit should have skipped it');
  };

  const result = await AiService.analyzeFoodCaloriesV4(
    null,
    'should not reach gemini',
    'gemini',
    FAKE_USER_ID,
    { pendingMealId }
  );

  AiService.analyzeQuantityWithGeminiV4 = originalAnalyze;

  if (geminiCalled) throw new Error('Gemini was invoked — short-circuit failed');
  if (!result.idempotent) throw new Error(`Expected idempotent=true, got ${JSON.stringify(result)}`);
  if (String(result.mealId) !== String(seeded._id)) {
    throw new Error(`Expected mealId=${seeded._id}, got ${result.mealId}`);
  }
  console.log('✓ [1/5] idempotent short-circuit returned active mealId without calling Gemini');
}

async function testUniqueIndexRejectsDuplicates() {
  const pendingMealId = `verify-uniq-${Date.now()}`;
  await Meal.create(buildMealDoc({ pendingMealId }));
  try {
    await Meal.create(buildMealDoc({ pendingMealId, name: 'dup' }));
    throw new Error('Duplicate insert should have failed on unique index');
  } catch (err) {
    if (err.code !== 11000) throw err;
    console.log('✓ [2/5] unique index rejected duplicate insert (E11000)');
  }
}

async function testPartialIndexAllowsNulls() {
  const a = await Meal.create(buildMealDoc({ pendingMealId: null, name: 'null-a' }));
  const b = await Meal.create(buildMealDoc({ pendingMealId: null, name: 'null-b' }));
  await Meal.deleteMany({ _id: { $in: [a._id, b._id] } });
  console.log('✓ [3/5] partial index allows multiple null pendingMealId rows');
}

// Fix #3: soft-deleted meal with matching pendingMealId must NOT block re-analyze
async function testSoftDeletedAllowsReinsert() {
  const pendingMealId = `verify-soft-${Date.now()}`;
  const original = await Meal.create(buildMealDoc({ pendingMealId }));
  // Soft-delete
  original.deletedAt = new Date();
  await original.save();

  // Now a fresh save with the same pendingMealId should succeed — the
  // soft-deleted row is excluded from the partial unique index.
  const fresh = await Meal.create(buildMealDoc({ pendingMealId, name: 'fresh-after-delete' }));
  if (!fresh._id) throw new Error('Expected fresh insert to succeed after soft-delete');
  if (String(fresh._id) === String(original._id)) {
    throw new Error('Fresh insert returned the soft-deleted _id — should be a new row');
  }
  console.log('✓ [4/5] soft-deleted row drops out of partial index; fresh insert succeeds');
}

// Fix #1: race condition — saveMealDataForV4 must recover from E11000 by
// returning the winning row instead of throwing a 500.
async function testE11000Recovery() {
  const pendingMealId = `verify-race-${Date.now()}`;
  const winner = await Meal.create(buildMealDoc({ pendingMealId, name: 'winner' }));

  // Simulate the losing side of the race: the findOne short-circuit missed
  // (because it ran just before the winner's save committed), so we land
  // in saveMealDataForV4 which will hit E11000 on save and recover.
  const nutritionResult = {
    mealName: 'Race loser',
    items: [],
    totalNutrition: { calories: 50, protein: 2, carbs: 5, fat: 1 }
  };
  const saved = await AiService.saveMealDataForV4(
    FAKE_USER_ID,
    null,
    nutritionResult,
    { pendingMealId, capturedAt: new Date() }
  );

  if (String(saved._id) !== String(winner._id)) {
    throw new Error(`E11000 recovery should have returned winner=${winner._id}, got ${saved._id}`);
  }
  // Also verify we didn't accidentally create a second row
  const count = await Meal.countDocuments({ userId: FAKE_USER_ID, pendingMealId });
  if (count !== 1) {
    throw new Error(`Expected exactly 1 row after race recovery, found ${count}`);
  }
  console.log('✓ [5/5] E11000 race recovery returns the winning row, no duplicate created');
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI_NEW || process.env.MONGO_URI);
  console.log('✓ connected to mongo');

  await recreateIdempotencyIndex();
  await cleanup();

  try {
    await testIdempotentShortCircuit();
    await cleanup();

    await testUniqueIndexRejectsDuplicates();
    await cleanup();

    await testPartialIndexAllowsNulls();
    await cleanup();

    await testSoftDeletedAllowsReinsert();
    await cleanup();

    await testE11000Recovery();
    await cleanup();

    console.log('\n✅ all checks passed');
  } finally {
    await cleanup();
    await mongoose.disconnect();
    console.log('✓ cleanup + disconnect');
  }
}

main().catch((err) => {
  console.error('\n❌ verification failed:', err);
  process.exit(1);
});
