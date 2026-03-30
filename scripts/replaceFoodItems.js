/**
 * replaceFoodItems.js
 *
 * Replaces the entire food_items collection with data from the updated CSV.
 * All imported items get reviewed=true, itemType='single_item'.
 * Generates embeddings for all items after import.
 *
 * Usage: node Backend/scripts/replaceFoodItems.js
 */

const mongoose = require('mongoose');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const FoodItem = require('../models/schemas/FoodItem');
const embeddingService = require('../services/embeddingService');

const MONGO_URI = process.env.MONGO_URI_NEW || process.env.MONGO_URI;
const CSV_PATH = path.join(__dirname, '..', 'data', 'food_items_updated.csv');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
    } else if (line[i] === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += line[i];
    }
  }
  result.push(current.trim());
  return result;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  // Read CSV
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = csvContent.split('\n').filter(l => l.trim());
  const header = parseCSVLine(lines[0]);
  console.log(`CSV header: ${header.join(', ')}`);

  // Parse rows
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 10) continue;

    const [category, name, aliasesStr, cal, protein, carbs, fat, fiber, dataSource, verified] = cols;

    const aliases = aliasesStr
      ? aliasesStr.split('|').map(a => a.trim()).filter(Boolean)
      : [];

    items.push({
      name: name.trim(),
      aliases,
      category: category.trim(),
      dataSource: dataSource.trim(),
      verified: verified.trim().toUpperCase() === 'TRUE',
      reviewed: true,
      itemType: 'single_item',
      caloriesPer100g: parseFloat(cal) || 0,
      proteinPer100g: parseFloat(protein) || 0,
      carbsPer100g: parseFloat(carbs) || 0,
      fatPer100g: parseFloat(fat) || 0,
      fiberPer100g: parseFloat(fiber) || 0,
      usageCount: 0
    });
  }

  console.log(`Parsed ${items.length} items from CSV\n`);

  // Summary by category
  const catCounts = {};
  for (const item of items) {
    catCounts[item.category] = (catCounts[item.category] || 0) + 1;
  }
  console.log('Category breakdown:');
  for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  // Drop existing food_items
  const existingCount = await FoodItem.countDocuments();
  console.log(`\nDropping ${existingCount} existing food items...`);
  await FoodItem.collection.drop().catch(() => {});

  // Insert all items (without embeddings first)
  const result = await FoodItem.insertMany(items);
  console.log(`Inserted ${result.length} food items\n`);

  // Generate embeddings in batches
  console.log('Generating embeddings...');
  const allItems = await FoodItem.find({}).lean();
  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < allItems.length; i += 10) {
    const batch = allItems.slice(i, i + 10);
    const promises = batch.map(async (item) => {
      try {
        const searchText = embeddingService.getFoodSearchText({
          name: item.name,
          category: item.category,
          aliases: item.aliases || []
        });
        const embedding = await embeddingService.generateEmbedding(searchText);
        await FoodItem.updateOne({ _id: item._id }, {
          embedding,
          embeddingModel: embeddingService.EMBEDDING_MODEL,
          embeddingGeneratedAt: new Date()
        });
        embedded++;
      } catch (err) {
        failed++;
        console.error(`  Failed: ${item.name} — ${err.message}`);
      }
    });

    await Promise.all(promises);

    if ((i + 10) % 50 === 0 || i + 10 >= allItems.length) {
      console.log(`  Progress: ${Math.min(i + 10, allItems.length)}/${allItems.length} (${embedded} embedded, ${failed} failed)`);
    }
  }

  // Recreate indexes
  console.log('\nRecreating indexes...');
  await FoodItem.collection.createIndex({ name: 'text', aliases: 'text' });
  await FoodItem.collection.createIndex({ name: 1 });
  await FoodItem.collection.createIndex({ aliases: 1 });
  await FoodItem.collection.createIndex({ dataSource: 1, verified: 1 });
  await FoodItem.collection.createIndex({ usageCount: -1 });

  // Final summary
  const finalCount = await FoodItem.countDocuments();
  const withEmbeddings = await FoodItem.countDocuments({ embedding: { $ne: null } });
  console.log(`\n═══ SUMMARY ═══`);
  console.log(`Total items: ${finalCount}`);
  console.log(`With embeddings: ${withEmbeddings}`);
  console.log(`Failed embeddings: ${failed}`);

  await mongoose.disconnect();
  console.log('Done');
}

main().catch(e => { console.error(e); process.exit(1); });
