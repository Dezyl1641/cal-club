const mongoose = require('mongoose');
require('dotenv').config();

const { matchFood } = require('../services/foodMatcher');

/**
 * Integration Test: Semantic Search for Food Matching
 *
 * Tests the RAG-based semantic search system with real-world queries
 * Validates that common foods are correctly matched with high confidence
 *
 * Usage:
 *   node Backend/scripts/testSemanticSearch.js
 *
 * Expected: >85% match rate with confidence >0.7
 */

const testCases = [
  // Exact matches
  { query: 'Milk', category: 'dairy', expected: /milk/i, minConfidence: 0.90 },
  { query: 'Rice', category: 'grain', expected: /rice/i, minConfidence: 0.90 },

  // Regional variations (Hindi/Tamil names)
  { query: 'Dahi', category: 'dairy', expected: /yogurt|curd|dahi/i, minConfidence: 0.75 },
  { query: 'Roti', category: 'grain', expected: /chapati|roti|bread/i, minConfidence: 0.75 },
  { query: 'Dal', category: 'legumes', expected: /dal|lentil/i, minConfidence: 0.75 },

  // Complex queries (multi-word, descriptive)
  { query: 'Chopped Red Onions', category: 'vegetable', expected: /onion/i, minConfidence: 0.70 },
  { query: 'Grilled Chicken Breast', category: 'protein', expected: /chicken.*breast|breast.*chicken/i, minConfidence: 0.70 },
  { query: 'Brown Rice', category: 'grain', expected: /rice.*brown|brown.*rice/i, minConfidence: 0.70 },

  // Typos (semantic search should handle these)
  { query: 'Mlk', category: 'dairy', expected: /milk/i, minConfidence: 0.60 },
  { query: 'Chickn', category: 'protein', expected: /chicken/i, minConfidence: 0.60 },

  // Synonyms
  { query: 'Curd', category: 'dairy', expected: /yogurt|curd/i, minConfidence: 0.75 },
  { query: 'Yoghurt', category: 'dairy', expected: /yogurt|yoghurt/i, minConfidence: 0.85 },

  // Common Indian foods
  { query: 'Paneer', category: 'protein', expected: /paneer|cottage.*cheese/i, minConfidence: 0.80 },
  { query: 'Ghee', category: 'fat', expected: /ghee|butter.*clarified/i, minConfidence: 0.80 },
  { query: 'Atta', category: 'grain', expected: /flour.*wheat|wheat.*flour|atta/i, minConfidence: 0.70 }
];

async function testSemanticSearch() {
  try {
    console.log('🧪 Testing Semantic Search for Food Matching\n');

    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB\n');

    let successCount = 0;
    let failureCount = 0;
    const failures = [];

    console.log(`Running ${testCases.length} test cases...\n`);
    console.log('='.repeat(80));

    for (const [index, test] of testCases.entries()) {
      try {
        console.log(`\n[${index + 1}/${testCases.length}] Testing: "${test.query}" (${test.category})`);

        const result = await matchFood(test.query, test.category, 0.5); // Lower threshold to see all matches

        if (!result) {
          failureCount++;
          failures.push({
            test,
            reason: 'No match found',
            actual: null
          });
          console.log(`   ❌ FAIL: No match found`);
          continue;
        }

        const matched = result.food.name.match(test.expected);
        const confidenceMet = result.confidence >= test.minConfidence;

        if (matched && confidenceMet) {
          successCount++;
          console.log(`   ✅ PASS: "${result.food.name}"`);
          console.log(`      Confidence: ${result.confidence.toFixed(2)} (min: ${test.minConfidence.toFixed(2)})`);
          console.log(`      Strategy: ${result.strategy}`);
          console.log(`      Data source: ${result.food.dataSource}`);
        } else if (!matched) {
          failureCount++;
          failures.push({
            test,
            reason: 'Name mismatch',
            actual: result.food.name,
            confidence: result.confidence
          });
          console.log(`   ❌ FAIL: Name mismatch`);
          console.log(`      Expected pattern: ${test.expected}`);
          console.log(`      Actual: "${result.food.name}"`);
          console.log(`      Confidence: ${result.confidence.toFixed(2)}`);
        } else if (!confidenceMet) {
          failureCount++;
          failures.push({
            test,
            reason: 'Low confidence',
            actual: result.food.name,
            confidence: result.confidence
          });
          console.log(`   ❌ FAIL: Confidence too low`);
          console.log(`      Matched: "${result.food.name}"`);
          console.log(`      Confidence: ${result.confidence.toFixed(2)} (min: ${test.minConfidence.toFixed(2)})`);
        }

      } catch (testErr) {
        failureCount++;
        failures.push({
          test,
          reason: 'Error',
          error: testErr.message
        });
        console.log(`   ❌ ERROR: ${testErr.message}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 Test Summary:');
    console.log('='.repeat(80));
    console.log(`✅ Passed: ${successCount}/${testCases.length} (${(successCount / testCases.length * 100).toFixed(1)}%)`);
    console.log(`❌ Failed: ${failureCount}/${testCases.length} (${(failureCount / testCases.length * 100).toFixed(1)}%)`);

    if (failures.length > 0) {
      console.log('\n❌ Failed Tests:');
      failures.forEach((failure, i) => {
        console.log(`\n${i + 1}. "${failure.test.query}" (${failure.test.category})`);
        console.log(`   Reason: ${failure.reason}`);
        if (failure.actual) {
          console.log(`   Got: "${failure.actual}" (confidence: ${failure.confidence?.toFixed(2)})`);
        }
        if (failure.error) {
          console.log(`   Error: ${failure.error}`);
        }
      });
    }

    // Success criteria
    const successRate = successCount / testCases.length;
    console.log('\n' + '='.repeat(80));
    if (successRate >= 0.85) {
      console.log('🎉 SUCCESS: Semantic search meets >85% success criteria!');
    } else {
      console.log('⚠️  WARNING: Success rate below 85% target');
      console.log(`   Current: ${(successRate * 100).toFixed(1)}%`);
      console.log(`   Target: 85.0%`);
      console.log(`   Gap: ${((0.85 - successRate) * 100).toFixed(1)}%`);
    }

    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');

    // Exit with appropriate code
    process.exit(successRate >= 0.85 ? 0 : 1);

  } catch (err) {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  }
}

// Run the test
testSemanticSearch();
