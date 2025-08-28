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
      // Single day filter
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
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
      ...dateFilter
    })
    .sort({ capturedAt: -1 })
    .skip(parseInt(skip))
    .limit(parseInt(limit));
  }

  static async getMealById(userId, mealId) {
    return Meal.findOne({ _id: mealId, userId });
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
      { _id: mealId, userId },
      updateData,
      { new: true }
    );
  }

  static async deleteMeal(userId, mealId) {
    // Hard delete - just remove the document
    return Meal.findOneAndDelete({ _id: mealId, userId });
  }

  static async getDailySummary(userId, startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1); // Make end date exclusive

    return Meal.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
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
    const givenDate = new Date(date);
    
    // Calculate Monday of the week (0 = Sunday, 1 = Monday, etc.)
    const dayOfWeek = givenDate.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days
    
    const startDate = new Date(givenDate);
    startDate.setDate(startDate.getDate() - daysToMonday); // Go back to Monday
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7); // Add 7 days to get end of week (next Monday)

    return Meal.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
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