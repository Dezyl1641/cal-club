const MealService = require('../services/mealService');
const Meal = require('../models/schemas/Meal');
const parseBody = require('../utils/parseBody');
const mealFormatter = require('../utils/mealFormatter');
const AiService = require('../services/aiService');

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
    
    // Format response according to new format
    const formattedResponse = mealFormatter.formatMealResponse(meal);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(formattedResponse));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch meal', details: error.message }));
  }
}

// Update meal endpoint
async function updateMeal(req, res) {
  parseBody(req, async (err, data) => {
    console.log('data' + JSON.stringify(data));
    if (err || !data.mealId || !data.itemId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'mealId and itemId are required' }));
      return;
    }

    try {
      const { mealId, itemId, newQuantity, newItem } = data;
      const userId = req.user.userId;
      console.log('newQuantity: ' + newQuantity);
      console.log('newItem: ' + newItem);
      console.log('mealId: ' + mealId);
      console.log('itemId: ' + itemId);
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
      console.log('newItem: ' + newItem);
      
      // Check if nutrition fields are being updated directly
      const nutritionUpdate = data.nutrition || {};
      const hasNutritionUpdate = nutritionUpdate.calories !== undefined || 
                                 nutritionUpdate.protein !== undefined || 
                                 nutritionUpdate.carbs !== undefined || 
                                 nutritionUpdate.fat !== undefined;

      // Case 1: Quantity update (newQuantity is non-null, newItem is null)
      if (newQuantity !== null && newQuantity !== undefined && !newItem) {
        // Update quantity and recalculate nutrition proportionally
        const oldQuantity = item.quantity.llm.value;
        const ratio = newQuantity / oldQuantity;

        // Update final quantity
        item.quantity.final = {
          value: newQuantity,
          unit: item.quantity.llm.unit
        };

        // Update final nutrition proportionally (only if not being updated directly)
        if (!hasNutritionUpdate) {
          item.nutrition.calories.final = parseFloat((item.nutrition.calories.llm * ratio).toFixed(2));
          item.nutrition.protein.final = parseFloat((item.nutrition.protein.llm * ratio).toFixed(2));
          item.nutrition.carbs.final = parseFloat((item.nutrition.carbs.llm * ratio).toFixed(2));
          item.nutrition.fat.final = parseFloat((item.nutrition.fat.llm * ratio).toFixed(2));
        }
      }

      // Case 1.5: Direct nutrition fields update
      if (hasNutritionUpdate) {
        // Update final nutrition values directly
        if (nutritionUpdate.calories !== undefined) {
          item.nutrition.calories.final = parseFloat(parseFloat(nutritionUpdate.calories || 0).toFixed(2));
        }
        if (nutritionUpdate.protein !== undefined) {
          item.nutrition.protein.final = parseFloat(parseFloat(nutritionUpdate.protein || 0).toFixed(2));
        }
        if (nutritionUpdate.carbs !== undefined) {
          item.nutrition.carbs.final = parseFloat(parseFloat(nutritionUpdate.carbs || 0).toFixed(2));
        }
        if (nutritionUpdate.fat !== undefined) {
          item.nutrition.fat.final = parseFloat(parseFloat(nutritionUpdate.fat || 0).toFixed(2));
        }
      }

      // If quantity or nutrition was updated, recompute total nutrition
      if ((newQuantity !== null && newQuantity !== undefined && !newItem) || hasNutritionUpdate) {
        // Recompute total nutrition using final values
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
        
        // Determine the quantity value to use
        const quantityValue = newQuantity !== null && newQuantity !== undefined 
          ? newQuantity 
          : aiResult.quantity.value;
        const quantityUnit = aiResult.quantity.unit;
        
        // Update item name and quantity
        item.name.final = aiResult.name;

        
        // Update final quantity if newQuantity is provided
        if (newQuantity !== null && newQuantity !== undefined) {
          item.quantity.final = {
            value: newQuantity,
            unit: quantityUnit
          };
        }

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
      res.end(JSON.stringify({ error: 'Either newQuantity, newItem, or nutrition fields must be provided' }));

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
    // Use final values if available (not null/undefined), otherwise fallback to llm values
    // Final values take priority and should be used in total nutrition calculation
    const calories = (item.nutrition.calories.final !== null && item.nutrition.calories.final !== undefined) 
      ? item.nutrition.calories.final 
      : item.nutrition.calories.llm;
    const protein = (item.nutrition.protein.final !== null && item.nutrition.protein.final !== undefined) 
      ? item.nutrition.protein.final 
      : item.nutrition.protein.llm;
    const carbs = (item.nutrition.carbs.final !== null && item.nutrition.carbs.final !== undefined) 
      ? item.nutrition.carbs.final 
      : item.nutrition.carbs.llm;
    const fat = (item.nutrition.fat.final !== null && item.nutrition.fat.final !== undefined) 
      ? item.nutrition.fat.final 
      : item.nutrition.fat.llm;

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

function bulkEditItems(req, res) {
  parseBody(req, async (err, data) => {
    if (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }

    try {
      const { mealId, items } = data;

      if (!mealId || !items || !Array.isArray(items) || items.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'mealId and items array are required' }));
        return;
      }

      // Fetch the meal
      const meal = await Meal.findOne({ _id: mealId, userId: req.user.userId });
      if (!meal) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Meal not found' }));
        return;
      }

      // Prepare items for batch AI call
      const batchItems = [];
      const itemUpdates = new Map(); // Map itemId to update data
      let hasMainItemChange = false;
      let mainItemInfo = null;

      // Process each item update request
      for (const itemUpdate of items) {
        const { itemId, newQuantity, newItem } = itemUpdate;

        if (!itemId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Each item must have an itemId' }));
          return;
        }

        // Find the item in the meal
        const itemIndex = meal.items.findIndex(item => item.id === itemId);
        if (itemIndex === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Item with id ${itemId} not found in meal` }));
          return;
        }

        const item = meal.items[itemIndex];
        itemUpdates.set(itemId, { itemIndex, newQuantity, newItem, originalItem: item });

        // Only add to batch if newItem is provided (name change)
        if (newItem) {
          const isMainItem = isMainFoodItem(item.name.llm);
          
          batchItems.push({
            originalName: item.name.llm,
            newName: newItem,
            newQuantity: newQuantity !== null && newQuantity !== undefined ? newQuantity : item.quantity.llm.value,
            unit: item.quantity.llm.unit,
            isMainItem
          });

          if (isMainItem) {
            hasMainItemChange = true;
            mainItemInfo = {
              originalName: item.name.llm,
              newName: newItem
            };
          }
        }
      }

      // Make single AI call if there are any item name changes
      let aiResult = null;
      if (batchItems.length > 0) {
        aiResult = await AiService.batchUpdateFoodItems(
          batchItems,
          meal.name,
          hasMainItemChange,
          mainItemInfo
        );
      }

      // Apply updates to each item
      let aiItemIndex = 0;
      for (const [itemId, updateData] of itemUpdates) {
        const { itemIndex, newQuantity, newItem, originalItem } = updateData;
        const item = meal.items[itemIndex];

        if (newItem && aiResult) {
          // Case: Item name changed - use AI result
          const aiItem = aiResult.items[aiItemIndex];
          aiItemIndex++;

          // Determine the quantity value to use
          const quantityValue = newQuantity !== null && newQuantity !== undefined 
            ? newQuantity 
            : aiItem.quantity.value;

          const quantityUnit = newQuantity !== null && newQuantity !== undefined 
            ? item.quantity.llm.unit
            : aiItem.quantity.unit;

          // Update item name and quantity
          item.name.final = aiItem.name;

    
          item.quantity.final = {
            value: newQuantity,
            unit: quantityUnit
          };
          

          // Update nutrition from AI
          item.nutrition.calories.final = aiItem.nutrition.calories;
          item.nutrition.protein.final = aiItem.nutrition.protein;
          item.nutrition.carbs.final = aiItem.nutrition.carbs;
          item.nutrition.fat.final = aiItem.nutrition.fat;

        } else if (newQuantity !== null && newQuantity !== undefined && !newItem) {
          // Case: Only quantity changed - calculate proportionally
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
        }
      }

      // Update meal name if AI changed it
      if (aiResult && aiResult.mealNameChanged) {
        meal.name = aiResult.mealName;
      }

      // Recompute total nutrition
      const updatedMeal = await recomputeTotalNutrition(meal);
      await updatedMeal.save();

      // Format response
      const formattedResponse = mealFormatter.formatMealResponse(updatedMeal);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(formattedResponse));

    } catch (error) {
      console.error('Error in bulkEditItems:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to bulk edit items', details: error.message }));
    }
  });
}

// Helper function to determine if an item is a main food item
function isMainFoodItem(itemName) {
  const mainKeywords = [
    'chicken', 'paneer', 'fish', 'mutton', 'egg', 'tofu', 'dal', 'lentil',
    'rice', 'roti', 'naan', 'paratha', 'bread', 'pasta', 'noodles', 'biryani',
    'curry', 'sabzi', 'gravy', 'meat', 'beef', 'pork', 'lamb', 'prawn', 'shrimp'
  ];
  
  const lowerItemName = itemName.toLowerCase();
  return mainKeywords.some(keyword => lowerItemName.includes(keyword));
}

module.exports = {
  createMeal,
  getMeals,
  getMealById,
  updateMeal,
  bulkEditItems,
  deleteMeal,
  getDailySummary,
  getCalendarData
}; 