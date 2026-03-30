const FoodItem = require('../models/schemas/FoodItem');
const embeddingService = require('./embeddingService');

/**
 * Vector Search Service - Semantic food search using MongoDB Atlas Vector Search
 *
 * Uses MongoDB Atlas $vectorSearch aggregation with HNSW algorithm
 * Index: food_embedding_index (768 dimensions, cosine similarity)
 * Expected latency: 50-100ms for 1.4K vectors
 */

/**
 * Map Atlas vector search score to confidence (0-1 range)
 * Atlas returns cosine similarity scores between 0-1
 * @param {number} score - Vector search score (cosine similarity)
 * @returns {number} Confidence value (0-1)
 */
function mapScoreToConfidence(score) {
  // Cosine similarity interpretation:
  // > 0.9 = very high similarity (exact or near-exact match)
  // 0.7-0.9 = high similarity (clear semantic match)
  // 0.5-0.7 = medium similarity (related concepts)
  // < 0.5 = low similarity (weak match)

  if (score > 0.9) return 0.95;  // Very high confidence
  if (score > 0.7) return 0.85;  // High confidence
  if (score > 0.5) return 0.75;  // Medium confidence
  return score * 0.7;            // Penalize low scores
}

/**
 * Perform semantic search using vector embeddings
 * @param {string} queryText - Search query (e.g., "Milk", "Dahi", "Chopped Red Onions")
 * @param {string} category - Optional category filter (protein, grain, dairy, etc.)
 * @param {number} limit - Maximum results to return (default: 5)
 * @returns {Promise<Array>} Array of {food, confidence, strategy} objects
 */
async function semanticSearch(queryText, category = null, limit = 5) {
  if (!queryText || typeof queryText !== 'string') {
    throw new Error('Query text must be a non-empty string');
  }

  try {
    const startTime = Date.now();

    // Step 1: Generate embedding for query
    const queryEmbedding = await embeddingService.generateEmbedding(queryText);

    // Step 2: Build MongoDB Atlas $vectorSearch pipeline
    const pipeline = [
      {
        $vectorSearch: {
          index: 'food_embedding_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: 50,  // Number of candidates for HNSW algorithm
          limit: limit
        }
      },
      {
        $project: {
          name: 1,
          aliases: 1,
          category: 1,
          dataSource: 1,
          sourceId: 1,
          verified: 1,
          caloriesPer100g: 1,
          proteinPer100g: 1,
          carbsPer100g: 1,
          fatPer100g: 1,
          fiberPer100g: 1,
          usageCount: 1,
          embeddingModel: 1,
          score: { $meta: 'vectorSearchScore' }
        }
      }
    ];

    // Step 3: Execute vector search
    const results = await FoodItem.aggregate(pipeline);

    const latency = Date.now() - startTime;

    // Step 4: Filter by category if provided (post-search filter)
    let filteredResults = results;
    if (category) {
      filteredResults = results.filter(r => r.category === category);
    }

    // Step 5: Map to expected format with confidence scores
    const mappedResults = filteredResults.map(result => ({
      food: result,
      confidence: mapScoreToConfidence(result.score),
      strategy: 'semantic_search',
      vectorScore: result.score,
      latencyMs: latency
    }));

    // Log for monitoring
    console.log({
      timestamp: new Date().toISOString(),
      event: 'semantic_search',
      query: queryText,
      category: category || 'none',
      topResult: mappedResults[0]?.food?.name || 'none',
      confidence: mappedResults[0]?.confidence || 0,
      vectorScore: mappedResults[0]?.vectorScore || 0,
      latency: latency,
      resultsCount: mappedResults.length
    });

    return mappedResults;

  } catch (err) {
    console.error(`Semantic search error for "${queryText}":`, err);

    // Handle specific MongoDB errors
    if (err.message.includes('index not found') || err.message.includes('food_embedding_index')) {
      throw new Error('Vector search index not found. Please create "food_embedding_index" in MongoDB Atlas.');
    }

    throw new Error(`Semantic search failed: ${err.message}`);
  }
}

/**
 * Check if vector search index exists
 * @returns {Promise<boolean>} True if index exists
 */
async function checkVectorIndexExists() {
  try {
    // Try a simple vector search query
    const testEmbedding = new Array(768).fill(0);
    await FoodItem.aggregate([
      {
        $vectorSearch: {
          index: 'food_embedding_index',
          path: 'embedding',
          queryVector: testEmbedding,
          numCandidates: 1,
          limit: 1
        }
      }
    ]);
    return true;
  } catch (err) {
    if (err.message.includes('index not found') || err.message.includes('food_embedding_index')) {
      return false;
    }
    throw err;
  }
}

/**
 * Get statistics about vector search coverage
 * @returns {Promise<Object>} Statistics object
 */
async function getVectorSearchStats() {
  const total = await FoodItem.countDocuments();
  const withEmbeddings = await FoodItem.countDocuments({ embedding: { $ne: null } });
  const byDataSource = await FoodItem.aggregate([
    { $match: { embedding: { $ne: null } } },
    { $group: { _id: '$dataSource', count: { $sum: 1 } } }
  ]);

  return {
    total,
    withEmbeddings,
    coveragePercent: (withEmbeddings / total * 100).toFixed(1),
    byDataSource: byDataSource.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {})
  };
}

module.exports = {
  semanticSearch,
  checkVectorIndexExists,
  getVectorSearchStats,
  mapScoreToConfidence
};
