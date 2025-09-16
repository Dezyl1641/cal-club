const mongoose = require('mongoose');
const Meal = require('../models/schemas/Meal');

class MealService {
  static async createMeal(userId, mealData) {
    const meal = new Meal({
      userId,
      ...mealData
    });
    return meal.save();
  }

  static async getMeals(userId, query) {
    const { from, to, date, limit = 20, skip = 0 } = query;
    
    let dateFilter = {};
    
    if (date) {
      // Single day filter - handle local timezone properly
      const [year, month, day] = date.split('-').map(Number);
      const startDate = new Date(year, month - 1, day, 0, 0, 0, 0); // Local midnight
      const endDate = new Date(year, month - 1, day + 1, 0, 0, 0, 0); // Next day local midnight
      
      console.log(`[Timezone Debug] Date filter - Date: ${date}, Start: ${startDate.toISOString()}, End: ${endDate.toISOString()}`);
      
      dateFilter = {
        capturedAt: {
          $gte: startDate,
          $lt: endDate
        }
      };
    } else if (from || to) {
      // Date range filter
      dateFilter = {};
      if (from) dateFilter.$gte = new Date(from);
      if (to) dateFilter.$lt = new Date(to);
    }

    return Meal.find({
      userId,
      deletedAt: null,
      ...dateFilter
    })
    .sort({ capturedAt: -1 })
    .skip(parseInt(skip))
    .limit(parseInt(limit));
  }

  static async getMealById(userId, mealId) {
    return Meal.findOne({ _id: mealId, userId, deletedAt: null });
  }

  static async updateMeal(userId, mealId, updateData) {
    // Handle item updates by matching item IDs
    if (updateData.items) {
      const existingMeal = await this.getMealById(userId, mealId);
      if (!existingMeal) return null;

      const updatedItems = existingMeal.items.map(existingItem => {
        const updateItem = updateData.items.find(item => item.id === existingItem.id);
        return updateItem ? { ...existingItem.toObject(), ...updateItem } : existingItem;
      });

      updateData.items = updatedItems;
    }

    return Meal.findOneAndUpdate(
      { _id: mealId, userId, deletedAt: null },
      updateData,
      { new: true }
    );
  }

  static async deleteMeal(userId, mealId) {
    // Soft delete - set deletedAt timestamp
    return Meal.findOneAndUpdate(
      { _id: mealId, userId, deletedAt: null },
      { deletedAt: new Date() },
      { new: true }
    );
  }

  static async deleteAllMealsForUser(userId) {
    // Soft delete all meals for a user
    return Meal.updateMany(
      { userId, deletedAt: null },
      { deletedAt: new Date() }
    );
  }

  static async getDailySummary(userId, startDate, endDate) {
    // Handle date strings properly to avoid timezone issues
    let start, end;
    
    if (typeof startDate === 'string') {
      const [year, month, day] = startDate.split('-').map(Number);
      start = new Date(year, month - 1, day, 0, 0, 0, 0); // Local midnight
    } else {
      start = new Date(startDate);
    }
    
    if (typeof endDate === 'string') {
      const [year, month, day] = endDate.split('-').map(Number);
      end = new Date(year, month - 1, day + 1, 0, 0, 0, 0); // Next day local midnight
    } else {
      end = new Date(endDate);
      end.setDate(end.getDate() + 1); // Make end date exclusive
    }

    return Meal.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          deletedAt: null,
          capturedAt: { $gte: start, $lt: end }
        }
      },
      {
        $project: {
          date: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$capturedAt"
            }
          },
          effectiveCalories: {
            $ifNull: ["$totalNutrition.calories.final", "$totalNutrition.calories.llm"]
          },
          effectiveProtein: {
            $ifNull: ["$totalNutrition.protein.final", "$totalNutrition.protein.llm"]
          },
          effectiveCarbs: {
            $ifNull: ["$totalNutrition.carbs.final", "$totalNutrition.carbs.llm"]
          },
          effectiveFat: {
            $ifNull: ["$totalNutrition.fat.final", "$totalNutrition.fat.llm"]
          }
        }
      },
      {
        $group: {
          _id: "$date",
          date: { $first: "$date" },
          calories: { $sum: "$effectiveCalories" },
          protein: { $sum: "$effectiveProtein" },
          carbs: { $sum: "$effectiveCarbs" },
          fat: { $sum: "$effectiveFat" },
          mealCount: { $sum: 1 }
        }
      },
      {
        $sort: { date: 1 }
      }
    ]);
  }

  static async getCalendarData(userId, date) {
    // Parse the given date and calculate Monday-Sunday week
    // Handle date string properly to avoid timezone issues
    let givenDate;
    if (typeof date === 'string') {
      const [year, month, day] = date.split('-').map(Number);
      givenDate = new Date(year, month - 1, day, 12, 0, 0, 0); // Use noon to avoid timezone edge cases
    } else {
      givenDate = new Date(date);
    }
    
    // Calculate Monday of the week (0 = Sunday, 1 = Monday, etc.)
    const dayOfWeek = givenDate.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days
    
    const startDate = new Date(givenDate);
    startDate.setDate(startDate.getDate() - daysToMonday); // Go back to Monday
    startDate.setHours(0, 0, 0, 0); // Set to local midnight
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7); // Add 7 days to get end of week (next Monday)
    endDate.setHours(0, 0, 0, 0); // Set to local midnight

    return Meal.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          deletedAt: null,
          capturedAt: { $gte: startDate, $lt: endDate }
        }
      },
      {
        $project: {
          date: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$capturedAt"
            }
          },
          effectiveCalories: {
            $ifNull: ["$totalNutrition.calories.final", "$totalNutrition.calories.llm"]
          },
          effectiveProtein: {
            $ifNull: ["$totalNutrition.protein.final", "$totalNutrition.protein.llm"]
          },
          effectiveCarbs: {
            $ifNull: ["$totalNutrition.carbs.final", "$totalNutrition.carbs.llm"]
          },
          effectiveFat: {
            $ifNull: ["$totalNutrition.fat.final", "$totalNutrition.fat.llm"]
          }
        }
      },
      {
        $group: {
          _id: "$date",
          date: { $first: "$date" },
          calories: { $sum: "$effectiveCalories" },
          protein: { $sum: "$effectiveProtein" },
          carbs: { $sum: "$effectiveCarbs" },
          fat: { $sum: "$effectiveFat" },
          mealCount: { $sum: 1 }
        }
      },
      {
        $sort: { date: 1 }
      }
    ]);
  }
}

module.exports = MealService; 