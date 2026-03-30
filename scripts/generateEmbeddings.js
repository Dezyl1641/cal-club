const mongoose = require('mongoose');
require('dotenv').config();

const FoodItem = require('../models/schemas/FoodItem');
const embeddingService = require('../services/embeddingService');

/**
 * ETL Script: Generate Embeddings for Existing FoodItems
 *
 * Purpose: One-time script to generate embeddings for all 1,449 existing FoodItems
 * Model: OpenAI text-embedding-3-small
 * Batch size: 250 items (Gemini API limit)
 * Resume capability: Skips items with existing embeddings
 *
 * Usage:
 *   node Backend/scripts/generateEmbeddings.js
 *
 * Expected runtime: ~2-5 minutes for 1,449 items
 */

async function generateEmbeddings() {
  try {
    console.log('🚀 Starting embedding generation for FoodItems\n');

    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB\n');

    // Get statistics
    const total = await FoodItem.countDocuments();
    const alreadyEmbedded = await FoodItem.countDocuments({ embedding: { $ne: null } });
    const needsEmbedding = total - alreadyEmbedded;

    console.log(`Total FoodItems: ${total}`);
    console.log(`Already embedded: ${alreadyEmbedded}`);
    console.log(`Needs embedding: ${needsEmbedding}\n`);

    if (needsEmbedding === 0) {
      console.log('✅ All items already have embeddings. Nothing to do!');
      await mongoose.disconnect();
      return;
    }

    // Fetch items that need embeddings
    const itemsToEmbed = await FoodItem.find({ embedding: null }).lean();

    console.log(`Processing ${itemsToEmbed.length} items...\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Process items in batches
    const BATCH_SIZE = 50; // Process 50 items at a time (lower than Gemini limit for safety)

    for (let i = 0; i < itemsToEmbed.length; i += BATCH_SIZE) {
      const batch = itemsToEmbed.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(itemsToEmbed.length / BATCH_SIZE);

      console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} items)`);

      // Generate search text for each item
      const searchTexts = batch.map(item => embeddingService.getFoodSearchText(item));

      try {
        // Generate embeddings in batch
        const embeddings = await embeddingService.generateEmbeddingsBatch(searchTexts);

        // Update each item with its embedding
        const updatePromises = batch.map(async (item, index) => {
          try {
            await FoodItem.updateOne(
              { _id: item._id },
              {
                $set: {
                  embedding: embeddings[index],
                  embeddingModel: 'text-embedding-3-small',
                  embeddingGeneratedAt: new Date()
                }
              }
            );
            successCount++;
            return { success: true, name: item.name };
          } catch (updateErr) {
            errorCount++;
            errors.push({ name: item.name, error: updateErr.message });
            return { success: false, name: item.name, error: updateErr.message };
          }
        });

        const results = await Promise.all(updatePromises);

        // Log progress
        const succeeded = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        console.log(`   ✓ Embedded: ${succeeded} items`);
        if (failed > 0) {
          console.log(`   ✗ Failed: ${failed} items`);
        }

        // Progress indicator
        if ((i + batch.length) % 100 === 0 || i + batch.length >= itemsToEmbed.length) {
          console.log(`\n📊 Progress: ${Math.min(i + batch.length, itemsToEmbed.length)}/${itemsToEmbed.length} (${Math.round((i + batch.length) / itemsToEmbed.length * 100)}%)`);
          console.log(`   Success: ${successCount}, Errors: ${errorCount}`);
        }

      } catch (batchErr) {
        console.error(`   ✗ Batch error:`, batchErr.message);
        errorCount += batch.length;
        batch.forEach(item => {
          errors.push({ name: item.name, error: batchErr.message });
        });
      }

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < itemsToEmbed.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Final statistics
    console.log('\n' + '='.repeat(60));
    console.log('📊 Final Results:');
    console.log('='.repeat(60));
    console.log(`✓ Successfully embedded: ${successCount} items`);
    console.log(`✗ Failed: ${errorCount} items`);
    console.log(`Success rate: ${(successCount / itemsToEmbed.length * 100).toFixed(1)}%`);

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.slice(0, 10).forEach(err => {
        console.log(`   - ${err.name}: ${err.error}`);
      });
      if (errors.length > 10) {
        console.log(`   ... and ${errors.length - 10} more errors`);
      }
    }

    // Verify final coverage
    const finalEmbedded = await FoodItem.countDocuments({ embedding: { $ne: null } });
    console.log(`\n✅ Total items with embeddings: ${finalEmbedded}/${total} (${(finalEmbedded / total * 100).toFixed(1)}%)`);

    // Breakdown by data source
    const byDataSource = await FoodItem.aggregate([
      { $match: { embedding: { $ne: null } } },
      { $group: { _id: '$dataSource', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('\nEmbeddings by data source:');
    byDataSource.forEach(ds => {
      console.log(`   ${ds._id}: ${ds.count} items`);
    });

    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
    console.log('\n🎉 Embedding generation complete!');

  } catch (err) {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  }
}

// Run the script
generateEmbeddings();
