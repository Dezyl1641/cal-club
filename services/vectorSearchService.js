const FoodItem = require('../models/schemas/FoodItem');
const embeddingService = require('./embeddingService');

/**
 * Vector Search Service - Semantic food search using MongoDB Atlas Vector Search
 *
 * Uses MongoDB Atlas $vectorSearch aggregation with HNSW algorithm
 * Index: food_embedding_index (768 dimensions, cosine similarity)
 * Expected latency: 50-100ms for 1.4K vectors
 */

const MIN_VECTOR_SCORE = 0.80; // Minimum cosine similarity to accept a match

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
    const vectorSearchStage = {
      $vectorSearch: {
        index: 'food_embedding_index',
        path: 'embedding',
        queryVector: queryEmbedding,
        numCandidates: category ? 150 : 50,
        limit: category ? limit * 3 : limit
      }
    };

    // Pre-filter by category if provided
    if (category) {
      vectorSearchStage.$vectorSearch.filter = { category: category };
    }

    const pipeline = [
      vectorSearchStage,
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

    // Step 4: Filter by minimum score and map to expected format
    // Threshold on raw cosine score directly — simpler and more predictable
    const mappedResults = results
      .slice(0, limit)
      .filter(result => result.score >= MIN_VECTOR_SCORE)
      .map(result => ({
        food: result,
        confidence: result.score,
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

    if (err.message.includes('index not found') || err.message.includes('food_embedding_index')) {
      throw new Error('Vector search index not found. Please create "food_embedding_index" in MongoDB Atlas.');
    }

    throw new Error(`Semantic search failed: ${err.message}`);
  }
}

module.exports = {
  semanticSearch,
  MIN_VECTOR_SCORE
};
