const MealService = require('../services/mealService');
const Meal = require('../models/schemas/Meal');
const parseBody = require('../utils/parseBody');
const mealFormatter = require('../utils/mealFormatter');

function createMeal(req, res) {
  parseBody(req, async (err, mealData) => {
    if (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }

    try {
      const meal = await MealService.createMeal(req.user.userId, mealData);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(meal));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to create meal', details: error.message }));
    }
  });
}

async function getMeals(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const query = {
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    date: url.searchParams.get('date'),
    limit: url.searchParams.get('limit'),
    skip: url.searchParams.get('skip')
  };

  try {
    const meals = await MealService.getMeals(req.user.userId, query);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(meals));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch meals', details: error.message }));
  }
}

async function getMealById(req, res) {
  const mealId = req.url.split('/')[2]; // Extract ID from /meals/:id

  try {
    const meal = await MealService.getMealById(req.user.userId, mealId);
    if (!meal) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Meal not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(meal));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch meal', details: error.message }));
  }
}

// Update meal endpoint
async function updateMeal(req, res) {
  parseBody(req, async (err, data) => {
    if (err || !data.mealId || !data.itemId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'mealId and itemId are required' }));
      return;
    }

    try {
      const { mealId, itemId, newQuantity, newItem } = data;
      const userId = req.user.userId;

      // Get the meal and verify ownership
      const meal = await Meal.findOne({ _id: mealId, userId });
      if (!meal) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Meal not found' }));
        return;
      }

      // Find the item to update
      const itemIndex = meal.items.findIndex(item => item.id === itemId);
      if (itemIndex === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Item not found in meal' }));
        return;
      }

      const item = meal.items[itemIndex];

      // Case 1: Only quantity update (newQuantity is non-null, newItem is null)
      if (newQuantity !== null && newItem === null) {
        // Update quantity and recalculate nutrition proportionally
        const oldQuantity = item.quantity.llm.value;
        const ratio = newQuantity / oldQuantity;

        // Update final quantity
        item.quantity.final = {
          value: newQuantity,
          unit: item.quantity.llm.unit
        };

        // Update final nutrition proportionally
        item.nutrition.calories.final = parseFloat((item.nutrition.calories.llm * ratio).toFixed(2));
        item.nutrition.protein.final = parseFloat((item.nutrition.protein.llm * ratio).toFixed(2));
        item.nutrition.carbs.final = parseFloat((item.nutrition.carbs.llm * ratio).toFixed(2));
        item.nutrition.fat.final = parseFloat((item.nutrition.fat.llm * ratio).toFixed(2));

        // Recompute total nutrition
        const updatedMeal = await recomputeTotalNutrition(meal);
        await updatedMeal.save();

        // Format response according to new format
        const formattedResponse = mealFormatter.formatMealResponse(updatedMeal);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(formattedResponse));
        return;
      }

      // Case 2: Item name update (newItem is non-null)
      if (newItem !== null) {
        // Get AI nutrition for the new item and updated meal name
        const originalUnit = item.quantity.llm.unit;
        const aiResult = await getNutritionForItem(newItem, meal.name, item.name.llm, originalUnit);
        
        // Update item name and quantity
        item.name.final = aiResult.name;
        item.quantity.llm = {
          value: newQuantity !== null ? newQuantity : aiResult.quantity.value,
          unit: aiResult.quantity.unit
        };

        // Update new item nutrition
        item.nutrition.calories.llm = aiResult.nutrition.calories;
        item.nutrition.protein.llm = aiResult.nutrition.protein;
        item.nutrition.carbs.llm = aiResult.nutrition.carbs;
        item.nutrition.fat.llm = aiResult.nutrition.fat;
        // Set final values as null because this is a new item
        item.nutrition.calories.final = null;
        item.nutrition.protein.final = null;
        item.nutrition.carbs.final = null;
        item.nutrition.fat.final = null;

        // Update overall meal name if provided by AI
        if (aiResult.updatedMealName) {
          meal.name = aiResult.updatedMealName;
        }

        // Recompute total nutrition
        const updatedMeal = await recomputeTotalNutrition(meal);
        await updatedMeal.save();

        // Format response according to new format
        const formattedResponse = mealFormatter.formatMealResponse(updatedMeal);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(formattedResponse));
        return;
      }

      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Either newQuantity or newItem must be provided' }));

    } catch (error) {
      console.error('Error updating meal:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update meal', details: error.message }));
    }
  });
}

async function deleteMeal(req, res) {
  const mealId = req.url.split('/')[2]; // Extract ID from /meals/:id

  try {
    const result = await MealService.deleteMeal(req.user.userId, mealId);
    if (!result) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Meal not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Meal deleted successfully' }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to delete meal', details: error.message }));
  }
}

async function getDailySummary(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');

  if (!start || !end) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'start and end dates are required' }));
    return;
  }

  try {
    const summary = await MealService.getDailySummary(req.user.userId, start, end);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(summary));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch daily summary', details: error.message }));
  }
}

async function getCalendarData(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const date = url.searchParams.get('date');

  if (!date) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'date parameter is required (YYYY-MM-DD format)' }));
    return;
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'date must be in YYYY-MM-DD format' }));
    return;
  }

  try {
    const calendarData = await MealService.getCalendarData(req.user.userId, date);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(calendarData));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch calendar data', details: error.message }));
  }
}

// Helper function to recompute total nutrition
async function recomputeTotalNutrition(meal) {
  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;

  meal.items.forEach(item => {
    // Use final values if available, otherwise fallback to llm values
    const calories = item.nutrition.calories.final !== null ? item.nutrition.calories.final : item.nutrition.calories.llm;
    const protein = item.nutrition.protein.final !== null ? item.nutrition.protein.final : item.nutrition.protein.llm;
    const carbs = item.nutrition.carbs.final !== null ? item.nutrition.carbs.final : item.nutrition.carbs.llm;
    const fat = item.nutrition.fat.final !== null ? item.nutrition.fat.final : item.nutrition.fat.llm;

    totalCalories += parseFloat(calories || 0);
    totalProtein += parseFloat(protein || 0);
    totalCarbs += parseFloat(carbs || 0);
    totalFat += parseFloat(fat || 0);
  });

  // Update total nutrition with 2 decimal precision
  meal.totalNutrition.calories.final = parseFloat(totalCalories.toFixed(2));
  meal.totalNutrition.protein.final = parseFloat(totalProtein.toFixed(2));
  meal.totalNutrition.carbs.final = parseFloat(totalCarbs.toFixed(2));
  meal.totalNutrition.fat.final = parseFloat(totalFat.toFixed(2));

  return meal;
}

// Helper function to get nutrition for a new item via AI
async function getNutritionForItem(newItemName, currentMealName, previousItemName, originalUnit) {
  const AiService = require('../services/aiService');

  try {
    // Use OpenAI for this analysis
    const result = await AiService.analyzeFoodItemWithOpenAI(newItemName, currentMealName, previousItemName, originalUnit);
    const parsedResult = JSON.parse(result);
    console.log('parsedResult', JSON.stringify(parsedResult));
    return {
      name: parsedResult.name,
      quantity: parsedResult.quantity,
      nutrition: parsedResult.nutrition,
      updatedMealName: parsedResult.updatedMealName
    };
  } catch (error) {
    console.error('Error getting AI nutrition:', error);
    // Return default values if AI fails
    return {
      name: newItemName,
      quantity: { value: 1, unit: 'serving' },
      nutrition: { calories: 100, protein: 5, carbs: 15, fat: 3 },
      updatedMealName: currentMealName // Keep original name if AI fails
    };
  }
}

module.exports = {
  createMeal,
  getMeals,
  getMealById,
  updateMeal,
  deleteMeal,
  getDailySummary,
  getCalendarData
}; 