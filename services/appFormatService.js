const MealService = require('./mealService');
const { findUserById } = require('../models/user');

// Interfaces for type consistency
const AppBarData = {
  title: String,
  icon: String,
  caloriesBurnt: Number
};

const DayData = {
  dayLetter: String,
  date: Number,
  isSelected: Boolean
};

const WeekViewData = {
  days: [DayData]
};

const MacroCard = {
  icon: String,
  color: String,
  text: String,
  value: Number,
  completed: Number,
  target: Number
};

const MacroWidget = {
  widgetType: String,
  widgetData: {
    primary_card: MacroCard,
    secondary_cards: [MacroCard]
  }
};

const LogEntry = {
  mealId: String,
  dish_image: String,
  dish_name: String,
  time: String,
  calories: Number,
  protein: Number,
  carbs: Number,
  fat: Number
};

const LoggedWidget = {
  widgetType: String,
  widgetData: {
    title: String,
    subtitle: String,
    logs: [LogEntry],
    zero_state: {
      image: String,
      text: String
    }
  }
};

const FooterItem = {
  active: Boolean,
  icon: String,
  title: String,
  action: String
};

const AppCalendarResponse = {
  appBarData: AppBarData,
  weekViewData: WeekViewData,
  showFloatingActionButton: Boolean,
  widgets: [Object], // MacroWidget | LoggedWidget
  footerData: [FooterItem]
};

class AppFormatService {
  static async getAppCalendarData(userId, date) {
    try {
      // Get the raw calendar data
      const calendarData = await MealService.getCalendarData(userId, date);
      
      // Get user data for goals
      const user = await findUserById(userId);
      const goals = user?.goals || {
        dailyCalories: 2000,
        dailyProtein: 150,
        dailyCarbs: 250,
        dailyFats: 65
      };
      
      // Parse the date to get current day info
      const currentDate = new Date(date);
      const currentDayOfWeek = currentDate.getDay();
      const daysToMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
      const mondayDate = new Date(currentDate);
      mondayDate.setDate(mondayDate.getDate() - daysToMonday);
      
      // Calculate today's nutrition totals
      const todayData = this.getTodayNutritionData(calendarData, currentDate);
      
      // Get today's meals for logged widget
      const todayMeals = await this.getTodayMeals(userId, currentDate);
      
      // Format the response
      return {
        appBarData: this.formatAppBarData(todayData, goals.dailyCalories),
        weekViewData: this.formatWeekViewData(mondayDate, currentDate),
        showFloatingActionButton: true,
        widgets: [
          this.formatMacroWidget(todayData, goals),
          this.formatLoggedWidget(todayMeals)
        ],
        footerData: this.formatFooterData()
      };
    } catch (error) {
      throw new Error(`Failed to format app calendar data: ${error.message}`);
    }
  }

  static formatAppBarData(todayData, calorieGoal) {
    const caloriesBurnt = Math.max(0, calorieGoal - todayData.totalCalories);
    
    return {
      title: "CalClub",
      icon: "fire",
      caloriesBurnt: parseFloat(caloriesBurnt.toFixed(2))
    };
  }

  static formatWeekViewData(mondayDate, currentDate) {
    const days = [];
    const dayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(mondayDate);
      dayDate.setDate(dayDate.getDate() + i);
      
      const isSelected = this.isSameDay(dayDate, currentDate);
      
      days.push({
        dayLetter: dayLetters[i],
        date: dayDate.getDate(),
        isSelected: isSelected
      });
    }
    
    return { days };
  }

  static formatMacroWidget(todayData, goals) {
    const caloriesLeft = Math.max(0, goals.dailyCalories - todayData.totalCalories);
    const caloriesCompleted = todayData.totalCalories;
    
    return {
      widgetType: "macro_widget",
      widgetData: {
        primary_card: {
          icon: "fire",
          color: "black",
          text: "Calories left",
          value: parseFloat(caloriesLeft.toFixed(2)),
          completed: parseFloat(caloriesCompleted.toFixed(2)),
          target: goals.dailyCalories
        },
        secondary_cards: [
          {
            icon: "lightning",
            color: "red",
            text: "Protein",
            value: parseFloat(todayData.totalProtein.toFixed(2)),
            completed: parseFloat(todayData.totalProtein.toFixed(2)),
            target: goals.dailyProtein
          },
          {
            icon: "wheat",
            color: "brown",
            text: "Carbs",
            value: parseFloat(todayData.totalCarbs.toFixed(2)),
            completed: parseFloat(todayData.totalCarbs.toFixed(2)),
            target: goals.dailyCarbs
          },
          {
            icon: "water",
            color: "blue",
            text: "Fats",
            value: parseFloat(todayData.totalFat.toFixed(2)),
            completed: parseFloat(todayData.totalFat.toFixed(2)),
            target: goals.dailyFats
          }
        ]
      }
    };
  }

  static formatLoggedWidget(todayMeals) {
    if (todayMeals.length === 0) {
      return {
        widgetType: "logged_widget",
        widgetData: {
          title: "Today's Logs",
          subtitle: "Here's what you have logged today",
          logs: [],
          zero_state: {
            image: "",
            text: "You have no logs yet"
          }
        }
      };
    }
    
    const logs = todayMeals.map(meal => ({
      mealId: meal._id.toString(),
      dish_image: meal.photos?.[0]?.url || "",
      dish_name: meal.name || "Unknown Meal",
      time: this.formatTime(meal.capturedAt),
      calories: parseFloat((meal.totalNutrition?.calories?.final || meal.totalNutrition?.calories?.llm || 0).toFixed(2)),
      protein: parseFloat((meal.totalNutrition?.protein?.final || meal.totalNutrition?.protein?.llm || 0).toFixed(2)),
      carbs: parseFloat((meal.totalNutrition?.carbs?.final || meal.totalNutrition?.carbs?.llm || 0).toFixed(2)),
      fat: parseFloat((meal.totalNutrition?.fat?.final || meal.totalNutrition?.fat?.llm || 0).toFixed(2))
    }));
    
    return {
      widgetType: "logged_widget",
      widgetData: {
        title: "Today's Logs",
        subtitle: "Here's what you have logged today",
        logs: logs,
        zero_state: {
          image: "",
          text: "You have no logs yet"
        }
      }
    };
  }

  static formatFooterData() {
    return [
      {
        active: true,
        icon: "home",
        title: "Home",
        action: "navigate_home"
      },
      {
        "active": false,
        "icon": "progress",
        "title": "Progress",
        "action": "navigate_progress"
      },
      // {
      //     "active": false,
      //     "icon": "settings",
      //     "title": "Settings",
      //     "action": "navigate_settings"
      // }
    ];
  }

  // Helper methods
  static getTodayNutritionData(calendarData, currentDate) {
    const todayString = this.formatDateString(currentDate);
    const todayEntry = calendarData.find(entry => entry.date === todayString);
    
    return {
      totalCalories: todayEntry?.calories || 0,
      totalProtein: todayEntry?.protein || 0,
      totalCarbs: todayEntry?.carbs || 0,
      totalFat: todayEntry?.fat || 0,
      mealCount: todayEntry?.mealCount || 0
    };
  }

  static async getTodayMeals(userId, currentDate) {
    try {
      const todayString = this.formatDateString(currentDate);
      console.log(`[Timezone Debug] Current date: ${currentDate}, Formatted string: ${todayString}`);
      const meals = await MealService.getMeals(userId, { date: todayString });
      console.log(`[Timezone Debug] Found ${meals.length} meals for date: ${todayString}`);
      return meals || [];
    } catch (error) {
      console.error('Failed to fetch today meals:', error);
      return [];
    }
  }

  static formatDateString(date) {
    // Use local time instead of UTC to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  static formatTime(date) {
    const d = new Date(date);
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes}${ampm}`;
  }

  static isSameDay(date1, date2) {
    return date1.toDateString() === date2.toDateString();
  }

  /**
   * Get progress data for user
   * @param {string} userId - User ID
   * @returns {Object} Progress data
   */
  static async getProgressData(userId) {
    try {
      const User = require('../models/schemas/User');
      const UserLog = require('../models/schemas/UserLog');
      const mongoose = require('mongoose');

      // Convert userId to ObjectId if needed
      const userIdObjectId = typeof userId === 'string' 
        ? new mongoose.Types.ObjectId(userId) 
        : userId;

      // Get user data
      const user = await User.findById(userIdObjectId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get weight logs for this user (sorted by date ascending - oldest first)
      const weightLogs = await UserLog.find({
        userId: userIdObjectId,
        type: 'WEIGHT'
      }).sort({ date: 1 }); // Sort ascending: date: 1 means oldest dates first

      // Extract header from goals
      const header = user.goals?.targetGoal || user.goals?.goal || 'Track your progress';

      // Get start and current weight
      let startWeight = null;
      let currentWeight = null;
      let lastCheckedIn = null;

      if (weightLogs.length > 0) {
        // Start weight = oldest entry (first in sorted array)
        // Since date is sorted ascending (1), weightLogs[0] = oldest date
        const oldestLog = weightLogs[0];
        if (oldestLog && oldestLog.value) {
          startWeight = parseFloat(oldestLog.value);
        }

        // Current weight = latest entry (last in sorted array)
        // Since date is sorted ascending (1), weightLogs[length-1] = latest date
        const latestLog = weightLogs[weightLogs.length - 1];
        if (latestLog && latestLog.value) {
          currentWeight = parseFloat(latestLog.value);
        }
        
        // Last checked in = date of latest weight log
        if (latestLog && latestLog.date && /^\d{4}-\d{2}-\d{2}$/.test(latestLog.date)) {
          lastCheckedIn = latestLog.date; // Already in YYYY-MM-DD format
        }
      }

      // Get target weight from user goals
      const targetWeight = user.goals?.targetWeight || null;

      // Calculate weight change per week
      let weightChangePerWeek = 0;
      if (startWeight && currentWeight && weightLogs.length > 1) {
        try {
          // Parse dates with validation
          const startDateStr = weightLogs[0].date;
          const endDateStr = weightLogs[weightLogs.length - 1].date;
          
          if (startDateStr && endDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr) && /^\d{4}-\d{2}-\d{2}$/.test(endDateStr)) {
            const startDate = new Date(startDateStr + 'T00:00:00');
            const endDate = new Date(endDateStr + 'T00:00:00');
            
            // Validate dates are valid
            if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
              // Calculate weeks between
              const daysDiff = (endDate - startDate) / (1000 * 60 * 60 * 24);
              const weeksDiff = daysDiff / 7;
              
              if (weeksDiff > 0) {
                weightChangePerWeek = (currentWeight - startWeight) / weeksDiff;
              }
            }
          }
        } catch (error) {
          console.warn('Error calculating weight change per week:', error);
          weightChangePerWeek = 0;
        }
      }

      // Get daily goals from user
      const dailyGoal = {
        calorie: user.goals?.dailyCalories || 2000,
        protein: user.goals?.dailyProtein || 150,
        carbs: user.goals?.dailyCarbs || 250,
        fats: user.goals?.dailyFats || 65
      };

      // Format lastCheckedIn date
      let formattedLastCheckedIn = null;
      if (lastCheckedIn && /^\d{4}-\d{2}-\d{2}$/.test(lastCheckedIn)) {
        try {
          const date = new Date(lastCheckedIn + 'T00:00:00');
          if (!isNaN(date.getTime())) {
            formattedLastCheckedIn = date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            });
          }
        } catch (error) {
          console.warn('Error formatting lastCheckedIn date:', error);
        }
      }

      // Calculate nextCheckIn: max(today IST, lastCheckedIn + 7 days)
      let nextCheckIn = null;
      try {
        const now = new Date();
        const istFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const todayIST = istFormatter.format(now);

        if (lastCheckedIn && /^\d{4}-\d{2}-\d{2}$/.test(lastCheckedIn)) {
          // Add 7 days to lastCheckedIn
          const lastCheckInDate = new Date(lastCheckedIn + 'T00:00:00');
          if (!isNaN(lastCheckInDate.getTime())) {
            lastCheckInDate.setDate(lastCheckInDate.getDate() + 7);
            const nextCheckInDateStr = istFormatter.format(lastCheckInDate);

            // Compare dates (YYYY-MM-DD format allows string comparison)
            const nextCheckInDate = nextCheckInDateStr > todayIST ? nextCheckInDateStr : todayIST;
            const date = new Date(nextCheckInDate + 'T00:00:00');
            if (!isNaN(date.getTime())) {
              nextCheckIn = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              });
            }
          }
        }
        
        // If no lastCheckedIn or error, use today
        if (!nextCheckIn) {
          const date = new Date(todayIST + 'T00:00:00');
          if (!isNaN(date.getTime())) {
            nextCheckIn = date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            });
          }
        }
      } catch (error) {
        console.warn('Error calculating nextCheckIn:', error);
        // Fallback to today's date
        try {
          const now = new Date();
          nextCheckIn = now.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
        } catch (fallbackError) {
          nextCheckIn = null;
        }
      }

      // Footer data (static navigation)
      const footerData = [
        {
          active: false,
          icon: 'home',
          title: 'Home',
          action: 'navigate_home'
        },
        {
          active: true,
          icon: 'progress',
          title: 'Progress',
          action: 'navigate_progress'
        },
        // {
        //   active: false,
        //   icon: 'settings',
        //   title: 'Settings',
        //   action: 'navigate_settings'
        // }
      ];

      return {
        header,
        weightProgress: {
          startWeight: startWeight || 0,
          currentWeight: currentWeight || 0,
          targetWeight: targetWeight || 0,
          weightChangePerWeek: Math.round(weightChangePerWeek * 10) / 10 // Round to 1 decimal
        },
        dailyGoal,
        lastCheckedIn: formattedLastCheckedIn,
        nextCheckIn,
        footerData
      };
    } catch (error) {
      throw new Error(`Failed to fetch progress data: ${error.message}`);
    }
  }
}

module.exports = AppFormatService; 