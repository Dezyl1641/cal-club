const { GoogleGenerativeAI } = require('@google/generative-ai');
const Recommendation = require('../models/schemas/Recommendation');
const UserRecommendation = require('../models/schemas/UserRecommendation');
const Meal = require('../models/schemas/Meal');
const User = require('../models/schemas/User');
const NotificationService = require('./notificationService');
const MealService = require('./mealService');
const mongoose = require('mongoose');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

class RecommendationService {
  /**
   * Check if a recommendation should be created now
   * @param {string} dailyCreationTime - HH:MM format in IST
   * @returns {boolean} - True if current time is within 15 mins of dailyCreationTime
   */
  static isTimeToCreateRecommendation(dailyCreationTime) {
    try {
      const now = new Date();
      const istFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      
      const [hours, minutes] = istFormatter.format(now).split(':').map(Number);
      const currentTimeInMinutes = hours * 60 + minutes;
      
      const [creationHours, creationMinutes] = dailyCreationTime.split(':').map(Number);
      const creationTimeInMinutes = creationHours * 60 + creationMinutes;
      
      // Check if current time is within last 15 minutes of creation time
      const timeDiff = currentTimeInMinutes - creationTimeInMinutes;
      return timeDiff >= 0 && timeDiff < 15;
    } catch (error) {
      console.error('Error checking recommendation time:', error);
      return false;
    }
  }

  /**
   * Get today's date in IST (YYYY-MM-DD format)
   * @returns {string} - Today's date in IST
   */
  static getTodayISTDate() {
    const now = new Date();
    const istFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return istFormatter.format(now);
  }

  /**
   * Generate recommendation using Gemini
   * @param {string} recommendationPrompt - The base prompt
   * @param {string} mealSummary - Summary of today's meals and nutrition
   * @returns {Promise<string>} - Generated recommendation (1-2 lines)
   */
  static async generateRecommendationWithGemini(recommendationPrompt, mealSummary) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500 // Keep it short (1-2 lines)
        }
      });

      const prompt = `${recommendationPrompt}

Today's meals and nutrition summary:
${mealSummary}

Based on this, provide a SHORT 1-2 line recommendation (max 150 characters) for what the user should do next with their meals today. Be specific and actionable.

Return ONLY the recommendation text, nothing else.`;

      console.log(`\n🔍 [RECOMMENDATIONS DEBUG] Final Prompt:\n${prompt}\n`);

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ]
      });

      const responseText = result.response.text();
      console.log(`✅ [RECOMMENDATIONS DEBUG] Gemini Result:\n${responseText}\n`);
      console.log(`✅ [GEMINI] Generated recommendation: ${responseText.substring(0, 100)}`);
      return responseText.trim();
    } catch (error) {
      console.error('❌ [GEMINI] Error generating recommendation:', error.message);
      // Fallback recommendation
      return recommendationPrompt.split('\n')[0]; // Return first line of prompt as fallback
    }
  }

  /**
   * Get today's meal summary for a user
   * @param {ObjectId} userId - User ID
   * @returns {Promise<string>} - Formatted meal summary
   */
  static async getTodayMealSummary(userId) {
    try {
      const todayDate = this.getTodayISTDate();
      
      // Get daily summary for today
      const dailySummary = await MealService.getDailySummary(userId, todayDate, todayDate);
      
      if (!dailySummary || dailySummary.length === 0) {
        return 'No meals logged yet today.';
      }

      const summary = dailySummary[0];
      const caloriesRemaining = Math.max(0, 2000 - (summary.calories || 0)); // Default 2000 cal goal

      return `
Total Meals: ${summary.mealCount || 0}
Calories: ${Math.round(summary.calories || 0)} kcal
Protein: ${Math.round(summary.protein || 0)}g
Carbs: ${Math.round(summary.carbs || 0)}g
Fat: ${Math.round(summary.fat || 0)}g
Calories Remaining: ${Math.round(caloriesRemaining)} kcal
      `.trim();
    } catch (error) {
      console.error('Error getting meal summary:', error);
      return 'Unable to fetch meal data.';
    }
  }

  /**
   * Process recommendations - Called by cron every 15 mins
   */
  static async processRecommendations() {
    try {
      console.log(`\n🔔 [RECOMMENDATIONS] Starting recommendation processing at ${new Date().toISOString()}`);

      // Get all active recommendations
      const activeRecommendations = await Recommendation.find({ isActive: true });
      console.log(`📋 [RECOMMENDATIONS] Found ${activeRecommendations.length} active recommendations`);

      if (activeRecommendations.length === 0) {
        console.log('⚠️ [RECOMMENDATIONS] No active recommendations to process');
        return;
      }

      // Check which recommendations should be created now
      const recommendationsToProcess = activeRecommendations.filter(rec => 
        this.isTimeToCreateRecommendation(rec.dailyCreationTime)
      );

      console.log(`⏰ [RECOMMENDATIONS] ${recommendationsToProcess.length} recommendations match current time window`);

      if (recommendationsToProcess.length === 0) {
        console.log('⏭️ [RECOMMENDATIONS] No recommendations to create at this time');
        return;
      }

      // Get all users who have logged at least 1 meal today
      const todayDate = this.getTodayISTDate();
      const usersWithMeals = await this.getUsersWithMealsToday(todayDate);
      console.log(`👥 [RECOMMENDATIONS] Found ${usersWithMeals.length} users with meals today`);

      // Restrict to env-based test users only
      const { isTestUser } = require('../config/testUsers');
      const usersToProcess = usersWithMeals.filter(id => isTestUser(id));
      console.log(`👥 [RECOMMENDATIONS] Processing recommendations for ${usersToProcess.length} test users only`);

      if (usersToProcess.length === 0) {
        console.log('⚠️ [RECOMMENDATIONS] No test users with meals today');
        return;
      }

      // Create recommendations for each user
      let successCount = 0;
      let errorCount = 0;

      for (const userId of usersToProcess) {
        for (const recommendation of recommendationsToProcess) {
          try {
            await this.createUserRecommendation(userId, recommendation, todayDate);
            successCount++;
          } catch (error) {
            console.error(`❌ [RECOMMENDATIONS] Error creating recommendation for user ${userId}:`, error.message);
            errorCount++;
          }
        }
      }

      console.log(`✅ [RECOMMENDATIONS] Processing complete: ${successCount} created, ${errorCount} errors`);
    } catch (error) {
      console.error('❌ [RECOMMENDATIONS] Fatal error in processRecommendations:', error);
    }
  }

  /**
   * Get all users who have logged meals today
   * @param {string} todayDate - Today's date in YYYY-MM-DD format
   * @returns {Promise<ObjectId[]>} - Array of user IDs
   */
  static async getUsersWithMealsToday(todayDate) {
    try {
      const startOfDay = new Date(todayDate + 'T00:00:00');
      const endOfDay = new Date(todayDate + 'T23:59:59');

      const users = await Meal.distinct('userId', {
        deletedAt: null,
        capturedAt: { $gte: startOfDay, $lte: endOfDay }
      });

      return users;
    } catch (error) {
      console.error('Error fetching users with meals today:', error);
      return [];
    }
  }

  /**
   * Create a user recommendation
   * @param {ObjectId} userId - User ID
   * @param {Object} recommendation - Recommendation object
   * @param {string} todayDate - Today's date in YYYY-MM-DD format
   */
  static async createUserRecommendation(userId, recommendation, todayDate) {
    try {
      const idempotenceId = `${recommendation._id}_${todayDate}`;

      // Check if recommendation already exists for this user today (idempotence)
      const existingRec = await UserRecommendation.findOne({
        userId,
        recommendationId: recommendation._id,
        idempotenceId
      });

      if (existingRec) {
        console.log(`⏭️ [RECOMMENDATIONS] Recommendation already exists for user ${userId} (idempotenceId: ${idempotenceId})`);
        return;
      }

      // Get today's meal summary
      const mealSummary = await this.getTodayMealSummary(userId);
      console.log(`📊 [RECOMMENDATIONS DEBUG] Meal Summary for user ${userId}:\n${mealSummary}\n`);

      // Generate recommendation using Gemini
      const recommendationValue = await this.generateRecommendationWithGemini(
        recommendation.recommendationPrompt,
        mealSummary
      );

      // Calculate active window
      const now = new Date();
      const activeFrom = new Date(now);
      const activeTo = new Date(now.getTime() + recommendation.activeMinutes * 60 * 1000);

      console.log(`⏱️ [RECOMMENDATIONS DEBUG] Active Window - From: ${activeFrom.toISOString()}, To: ${activeTo.toISOString()}`);

      // Create user recommendation
      const userRec = new UserRecommendation({
        userId,
        recommendationId: recommendation._id,
        idempotenceId,
        value: recommendationValue,
        activeFrom,
        activeTo,
        notificationId: null,
        notificationSent: false
      });

      await userRec.save();
      console.log(`✅ [RECOMMENDATIONS] Created recommendation for user ${userId}`);
      console.log(`💾 [RECOMMENDATIONS DEBUG] Saved to DB - ID: ${userRec._id}, idempotenceId: ${idempotenceId}\n`);

      // Send Firebase notification
      try {
        const notificationId = await this.sendRecommendationNotification(userId, recommendationValue);
        if (notificationId) {
          userRec.notificationId = notificationId;
          userRec.notificationSent = true;
          await userRec.save();
          console.log(`📲 [RECOMMENDATIONS] Notification sent with ID: ${notificationId}`);
        }
      } catch (notificationError) {
        console.warn(`⚠️ [RECOMMENDATIONS] Failed to send notification:`, notificationError.message);
        // Don't fail the whole operation if notification fails
      }

      return userRec;
    } catch (error) {
      // Handle duplicate key error gracefully (idempotence)
      if (error.code === 11000) {
        console.log(`⏭️ [RECOMMENDATIONS] Duplicate recommendation detected (idempotence)`);
        return;
      }
      throw error;
    }
  }

  /**
   * Send Firebase notification for recommendation
   * @param {ObjectId} userId - User ID
   * @param {string} recommendationText - The recommendation text
   * @returns {Promise<string|null>} - Notification ID or null
   */
  static async sendRecommendationNotification(userId, recommendationText) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.fcmToken) {
        console.warn(`⚠️ [NOTIFICATIONS] No FCM token for user ${userId}`);
        return null;
      }

      const notificationId = await NotificationService.sendNotification({
        userId,
        title: 'Nutrition Tip',
        body: recommendationText,
        fcmToken: user.fcmToken,
        data: {
          type: 'recommendation',
          screen: 'home'
        }
      });

      return notificationId;
    } catch (error) {
      console.error('Error sending recommendation notification:', error);
      return null;
    }
  }

  /**
   * Get active recommendation for user (if any)
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Object|null>} - User recommendation or null
   */
  static async getActiveRecommendation(userId) {
    try {
      const now = new Date();

      // Get latest active recommendation for user
      const recommendation = await UserRecommendation.findOne({
        userId,
        activeFrom: { $lte: now },
        activeTo: { $gte: now }
      }).sort({ activeFrom: -1 }).lean();

      if (!recommendation) {
        return null;
      }

      return {
        heading: 'Tip',
        description: recommendation.value
      };
    } catch (error) {
      console.error('Error fetching active recommendation:', error);
      return null;
    }
  }

  /**
   * Create a new recommendation template (admin function)
   * @param {Object} data - Recommendation data
   * @returns {Promise<Object>} - Created recommendation
   */
  static async createRecommendationTemplate(data) {
    try {
      const recommendation = new Recommendation({
        dailyCreationTime: data.dailyCreationTime,
        activeMinutes: data.activeMinutes || 120,
        type: data.type,
        recommendationPrompt: data.recommendationPrompt,
        isActive: data.isActive !== false
      });

      await recommendation.save();
      console.log(`✅ [RECOMMENDATIONS] Created recommendation template: ${recommendation._id}`);
      return recommendation;
    } catch (error) {
      console.error('Error creating recommendation template:', error);
      throw error;
    }
  }
}

module.exports = RecommendationService;
