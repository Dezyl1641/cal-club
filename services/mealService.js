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
      // Single day filter - treat date as IST date
      // IST is UTC+5:30, so IST midnight (00:00 IST) = 18:30 UTC previous day
      const [year, month, day] = date.split('-').map(Number);
      // Start: YYYY-MM-DD 00:00:00 IST = YYYY-MM-(DD-1) 18:30:00 UTC
      const startDate = new Date(Date.UTC(year, month - 1, day - 1, 18, 30, 0, 0));
      // End: YYYY-MM-(DD+1) 00:00:00 IST = YYYY-MM-DD 18:30:00 UTC
      const endDate = new Date(Date.UTC(year, month - 1, day, 18, 30, 0, 0));
      
      console.log(`[Timezone Debug] Date filter (IST) - Date: ${date}, Start: ${startDate.toISOString()}, End: ${endDate.toISOString()}`);
      
      dateFilter = {
        capturedAt: {
          $gte: startDate,
          $lt: endDate
        }
      };
    } else if (from || to) {
      // Date range filter - treat as IST dates
      dateFilter = {};
      if (from) {
        const [year, month, day] = from.split('-').map(Number);
        dateFilter.$gte = new Date(Date.UTC(year, month - 1, day - 1, 18, 30, 0, 0));
      }
      if (to) {
        const [year, month, day] = to.split('-').map(Number);
        // End date should be exclusive, so use next day's IST midnight
        dateFilter.$lt = new Date(Date.UTC(year, month - 1, day, 18, 30, 0, 0));
      }
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
    // Parse the given date in IST context
    let givenDate;
    if (typeof date === 'string') {
      const [year, month, day] = date.split('-').map(Number);
      // Create date at noon IST (06:30 UTC) to avoid timezone edge cases
      givenDate = new Date(Date.UTC(year, month - 1, day, 6, 30, 0, 0));
    } else {
      givenDate = new Date(date);
    }
    
    // Get day of week in IST
    const istDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(givenDate);
    
    const [year, month, day] = istDateStr.split('-').map(Number);
    const istDate = new Date(Date.UTC(year, month - 1, day, 6, 30, 0, 0));
    const dayOfWeek = istDate.getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days
    
    // Calculate Monday of the week in IST
    const mondayIST = new Date(istDate);
    mondayIST.setUTCDate(mondayIST.getUTCDate() - daysToMonday);
    
    // Get Monday date components in IST
    const mondayISTStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(mondayIST);
    
    const [mondayYear, mondayMonth, mondayDay] = mondayISTStr.split('-').map(Number);
    
    // Convert IST midnight boundaries to UTC for MongoDB query
    // IST midnight (00:00 IST) = 18:30 previous day UTC
    // Monday IST midnight = (Monday - 1 day) 18:30 UTC
    const startDateUTC = new Date(Date.UTC(mondayYear, mondayMonth - 1, mondayDay - 1, 18, 30, 0, 0));
    
    // End date: next Monday IST midnight
    // Calculate next Monday date first
    const nextMondayIST = new Date(mondayIST);
    nextMondayIST.setUTCDate(nextMondayIST.getUTCDate() + 7);
    const nextMondayISTStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(nextMondayIST);
    const [nextMondayYear, nextMondayMonth, nextMondayDay] = nextMondayISTStr.split('-').map(Number);
    const endDateUTC = new Date(Date.UTC(nextMondayYear, nextMondayMonth - 1, nextMondayDay - 1, 18, 30, 0, 0));

    return Meal.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          deletedAt: null,
          capturedAt: { $gte: startDateUTC, $lt: endDateUTC }
        }
      },
      {
        $project: {
          date: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$capturedAt",
              timezone: "Asia/Kolkata"
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