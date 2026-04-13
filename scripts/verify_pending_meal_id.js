require('dotenv').config();
const mongoose = require('mongoose');
const Meal = require('../models/schemas/Meal');
const AiService = require('../services/aiService');

const FAKE_USER_ID = new mongoose.Types.ObjectId('ffffffffffffffffffffffff');
const TEST_PENDING_ID = `verify-${Date.now()}`;

async function main() {
  await mongoose.connect(process.env.MONGO_URI_NEW || process.env.MONGO_URI);
  console.log('✓ connected to mongo');

  await Meal.syncIndexes();
  console.log('✓ Meal indexes synced');

  const cleanup = async () => {
    await Meal.deleteMany({ userId: FAKE_USER_ID, pendingMealId: { $regex: /^verify-/ } });
  };
  await cleanup();

  try {
    // Seed an existing meal for this (userId, pendingMealId) to prove idempotent read path.
    const seeded = await Meal.create({
      userId: FAKE_USER_ID,
      pendingMealId: TEST_PENDING_ID,
      capturedAt: new Date(),
      name: 'verification-seed',
      items: [],
      totalNutrition: {
        calories: { llm: 100, final: 100 },
        protein: { llm: 5, final: 5 },
        carbs: { llm: 10, final: 10 },
        fat: { llm: 2, final: 2 }
      },
      source: 'llm',
      userApproved: false
    });
    console.log(`✓ seeded meal ${seeded._id} with pendingMealId=${TEST_PENDING_ID}`);

    // Fail loudly if Gemini gets invoked — the short-circuit should prevent that.
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
      { pendingMealId: TEST_PENDING_ID }
    );

    AiService.analyzeQuantityWithGeminiV4 = originalAnalyze;

    if (geminiCalled) throw new Error('Gemini was invoked — short-circuit failed');
    if (!result.idempotent) throw new Error(`Expected idempotent=true, got ${JSON.stringify(result)}`);
    if (String(result.mealId) !== String(seeded._id)) {
      throw new Error(`Expected mealId=${seeded._id}, got ${result.mealId}`);
    }
    console.log(`✓ idempotent short-circuit returned mealId=${result.mealId} without calling Gemini`);

    // Also verify the unique index is in place and prevents duplicate inserts.
    try {
      await Meal.create({
        userId: FAKE_USER_ID,
        pendingMealId: TEST_PENDING_ID,
        capturedAt: new Date(),
        name: 'dup',
        items: [],
        totalNutrition: {
          calories: { llm: 0, final: 0 },
          protein: { llm: 0, final: 0 },
          carbs: { llm: 0, final: 0 },
          fat: { llm: 0, final: 0 }
        }
      });
      throw new Error('Duplicate insert should have failed on unique index');
    } catch (err) {
      if (err.code !== 11000) throw err;
      console.log('✓ unique index rejected duplicate insert (E11000)');
    }

    // Verify null pendingMealId does NOT trip the partial index (two nulls coexist).
    const nullA = await Meal.create({
      userId: FAKE_USER_ID,
      capturedAt: new Date(),
      name: 'null-a',
      items: [],
      totalNutrition: {
        calories: { llm: 0, final: 0 },
        protein: { llm: 0, final: 0 },
        carbs: { llm: 0, final: 0 },
        fat: { llm: 0, final: 0 }
      }
    });
    const nullB = await Meal.create({
      userId: FAKE_USER_ID,
      capturedAt: new Date(),
      name: 'null-b',
      items: [],
      totalNutrition: {
        calories: { llm: 0, final: 0 },
        protein: { llm: 0, final: 0 },
        carbs: { llm: 0, final: 0 },
        fat: { llm: 0, final: 0 }
      }
    });
    console.log('✓ partial index allows multiple null pendingMealId rows');
    await Meal.deleteMany({ _id: { $in: [nullA._id, nullB._id] } });

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
