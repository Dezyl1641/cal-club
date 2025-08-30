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
      title: "TrackAI",
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
        active: false,
        icon: "progress",
        title: "Progress",
        action: "navigate_progress"
      },
      {
        active: false,
        icon: "settings",
        title: "Settings",
        action: "navigate_settings"
      }
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
      const meals = await MealService.getMeals(userId, { date: todayString });
      return meals || [];
    } catch (error) {
      console.error('Failed to fetch today meals:', error);
      return [];
    }
  }

  static formatDateString(date) {
    return date.toISOString().split('T')[0];
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
}

module.exports = AppFormatService; 