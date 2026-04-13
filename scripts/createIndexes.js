const mongoose = require('mongoose');
require('dotenv').config();

const FoodItem = require('../models/schemas/FoodItem');
const Recipe = require('../models/schemas/Recipe');
const Meal = require('../models/schemas/Meal');

async function createIndexes() {
  try {
    console.log('Creating MongoDB indexes...\n');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/caltrack';
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB\n');

    // Create FoodItem indexes
    console.log('Creating FoodItem indexes...');
    await FoodItem.createIndexes();
    console.log('✓ FoodItem indexes created');

    // List FoodItem indexes
    const foodIndexes = await FoodItem.collection.getIndexes();
    console.log('\nFoodItem indexes:');
    Object.keys(foodIndexes).forEach(idx => {
      console.log(`  - ${idx}`);
    });

    // Create Recipe indexes
    console.log('\nCreating Recipe indexes...');
    await Recipe.createIndexes();
    console.log('✓ Recipe indexes created');

    // List Recipe indexes
    const recipeIndexes = await Recipe.collection.getIndexes();
    console.log('\nRecipe indexes:');
    Object.keys(recipeIndexes).forEach(idx => {
      console.log(`  - ${idx}`);
    });

    // syncIndexes() reconciles the collection's indexes with the schema —
    // needed for the partial unique index on (userId, pendingMealId) to land
    // on collections that were created before the field existed.
    console.log('\nSyncing Meal indexes...');
    await Meal.syncIndexes();
    console.log('✓ Meal indexes synced');

    const mealIndexes = await Meal.collection.getIndexes();
    console.log('\nMeal indexes:');
    Object.keys(mealIndexes).forEach(idx => {
      console.log(`  - ${idx}`);
    });

    console.log('\n✓ All indexes created successfully!');

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

createIndexes();
