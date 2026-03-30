/**
 * seedCompositeDishMappings.js
 *
 * Seeds the composite_dish_mappings collection from the JSON file.
 * Drops and recreates to avoid duplicates.
 *
 * Usage: node Backend/scripts/seedCompositeDishMappings.js
 */

const mongoose = require('mongoose');
require('dotenv').config();
const path = require('path');
const CompositeDishMapping = require('../models/schemas/CompositeDishMapping');

const MONGO_URI = process.env.MONGO_URI_NEW || process.env.MONGO_URI;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  const mappings = require(path.join(__dirname, '..', 'data', 'composite_dish_mapping.json'));

  // Drop existing collection
  await CompositeDishMapping.collection.drop().catch(() => {});
  console.log('Dropped existing composite_dish_mappings collection');

  // Insert all mappings
  const result = await CompositeDishMapping.insertMany(mappings);
  console.log(`Inserted ${result.length} composite dish mappings`);

  // Summary by protein type
  const summary = {};
  for (const m of mappings) {
    const protein = m.components.find(c => c.category === 'protein');
    const key = protein ? protein.name : 'other';
    summary[key] = (summary[key] || 0) + 1;
  }
  console.log('\nBreakdown by protein:');
  for (const [protein, count] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${protein}: ${count} dishes`);
  }

  await mongoose.disconnect();
  console.log('\nDone');
}

main().catch(e => { console.error(e); process.exit(1); });
