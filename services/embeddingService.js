const OpenAI = require('openai');

/**
 * Embedding Service - Wrapper around OpenAI text-embedding-3-small API
 * Provides text embedding generation for semantic search/RAG
 *
 * Model: text-embedding-3-small
 * - Dimensions: 768 (configurable, reduced from default 1536 for storage efficiency)
 * - Cost: $0.02/1M tokens (~$0.03/month for 1000 meals/day)
 * - Optimized for semantic search and retrieval tasks
 */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 768; // Reduced from default 1536 for storage efficiency

/**
 * Generate embedding for a single text
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} 768-dimensional embedding vector
 */
async function generateEmbedding(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string');
  }

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS
    });

    if (!response.data || !response.data[0] || !response.data[0].embedding) {
      throw new Error('Invalid embedding response from OpenAI API');
    }

    const embedding = response.data[0].embedding;

    // Validate dimensions
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`);
    }

    return embedding;
  } catch (err) {
    console.error(`Error generating embedding for text: "${text.substring(0, 50)}..."`);
    throw new Error(`Embedding generation failed: ${err.message}`);
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * OpenAI API supports up to 2048 texts per batch request
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} Array of 768-dimensional embeddings
 */
async function generateEmbeddingsBatch(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('Texts must be a non-empty array');
  }

  const BATCH_SIZE = 100; // Process 100 items at a time for safety
  const embeddings = [];

  try {
    // Process in batches
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)} (${batch.length} items)`);

      // OpenAI API supports true batch embedding
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS
      });

      if (!response.data || response.data.length !== batch.length) {
        throw new Error(`Expected ${batch.length} embeddings, got ${response.data?.length || 0}`);
      }

      // Extract embeddings in correct order
      const batchEmbeddings = response.data.map(item => item.embedding);
      embeddings.push(...batchEmbeddings);

      // Small delay between batches to avoid rate limiting (OpenAI has generous limits)
      if (i + BATCH_SIZE < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return embeddings;
  } catch (err) {
    console.error(`Error generating batch embeddings:`, err);
    throw new Error(`Batch embedding generation failed: ${err.message}`);
  }
}

/**
 * Get searchable text from a FoodItem for embedding
 * Concatenates name, aliases, and category for richer semantic matching
 * @param {Object} foodItem - FoodItem document
 * @returns {string} Searchable text
 */
function getFoodSearchText(foodItem) {
  const parts = [
    foodItem.name,
    ...(foodItem.aliases || []),
    foodItem.category
  ].filter(Boolean);

  return parts.join(' ');
}

module.exports = {
  generateEmbedding,
  generateEmbeddingsBatch,
  getFoodSearchText,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS
};
