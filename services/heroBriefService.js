const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const HeroBrief = require('../models/schemas/HeroBrief');
const Meal = require('../models/schemas/Meal');
const User = require('../models/schemas/User');
const Question = require('../models/schemas/Question');
const UserQuestion = require('../models/schemas/UserQuestion');
const MealService = require('./mealService');
const { PHASE_FALLBACKS, PHASE_HEADLINES, getCurrentPhaseIST } = require('../config/heroBriefFallbacks');
const { SYSTEM_INSTRUCTION, buildPrompt } = require('../config/heroBriefPrompt');
const { reportError } = require('../utils/sentryReporter');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// --- Circuit breaker state (in-memory, per-process) ---
// Keyed by userId string. Resets on server restart, which is acceptable.
const circuitBreaker = new Map();
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

class HeroBriefService {

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  /**
   * Get or generate a hero brief for the given user, date, and phase.
   *
   * @param {string} userId
   * @param {string} date       - YYYY-MM-DD
   * @param {string} phase      - morning | midday | evening
   * @param {boolean} regenerate - force re-generation (e.g. after meal log)
   * @returns {Promise<Object>}  { phase, headline, guidanceText, tier }
   */
  static async getOrGenerateBrief(userId, date, phase, regenerate = false) {
    try {
      // Determine if this phase is the current active phase for today
      const todayIST = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
      const isToday = date === todayIST;
      const currentPhase = getCurrentPhaseIST();
      const isActivePhase = isToday && phase === currentPhase;

      // 1. Check cache
      const cached = await HeroBrief.findOne({ userId, date, phase }).lean();
      if (cached) {
        // Past days and past phases: always return cache, never regenerate
        if (!isActivePhase) {
          return {
            phase: cached.phase,
            headline: PHASE_HEADLINES[cached.phase],
            guidanceText: cached.guidanceText,
            tier: cached.tier
          };
        }

        // Active phase: check if data changed (unless forced regeneration)
        if (!regenerate) {
          const currentHash = await this.computeInputHash(userId, date);
          if (cached.inputHash === currentHash) {
            return {
              phase: cached.phase,
              headline: PHASE_HEADLINES[cached.phase],
              guidanceText: cached.guidanceText,
              tier: cached.tier
            };
          }
          // Hash mismatch → data changed, fall through to regenerate
        }
      }

      // 2. Check circuit breaker
      if (this.isCircuitOpen(userId)) {
        console.warn(`[HeroBrief] Circuit breaker open for user ${userId}, returning fallback`);
        return this.buildFallbackResponse(phase);
      }

      // 3. Assemble input data
      const inputData = await this.assembleInputData(userId, date, phase);

      // 4. Generate via Gemini
      const guidanceText = await this.generateWithGemini(inputData);

      // 5. Cache the result (upsert)
      const inputHash = await this.computeInputHash(userId, date);
      await HeroBrief.findOneAndUpdate(
        { userId, date, phase },
        {
          userId,
          date,
          phase,
          guidanceText,
          tier: inputData.tier,
          generatedAt: new Date(),
          inputHash,
          createdAt: new Date()
        },
        { upsert: true, new: true }
      );

      // Reset circuit breaker on success
      this.resetCircuit(userId);

      return {
        phase,
        headline: PHASE_HEADLINES[phase],
        guidanceText,
        tier: inputData.tier
      };
    } catch (error) {
      reportError(error, { userId, date, phase });
      console.error('[HeroBrief] Error generating brief:', error.message);

      // Try returning stale cache if available
      const stale = await HeroBrief.findOne({ userId, date, phase }).lean().catch(() => null);
      if (stale) {
        return {
          phase: stale.phase,
          headline: PHASE_HEADLINES[stale.phase],
          guidanceText: stale.guidanceText,
          tier: stale.tier
        };
      }

      return this.buildFallbackResponse(phase);
    }
  }

  // -------------------------------------------------------------------
  // Input data assembly
  // -------------------------------------------------------------------

  static async assembleInputData(userId, date, phase) {
    const [user, todayNutrition, mealsToday, mealHistory, dietPreference] = await Promise.all([
      User.findById(userId).lean(),
      this.getTodayNutrition(userId, date),
      this.getTodayMeals(userId, date),
      this.getMealHistory(userId, 7),
      this.getDietPreference(userId)
    ]);

    const goals = user?.goals || { dailyCalories: 2000, dailyProtein: 150 };
    const tier = this.detectTier(mealHistory);

    return {
      phase,
      userName: user?.name || null,
      calorieGoal: goals.dailyCalories,
      caloriesConsumed: todayNutrition.calories,
      exerciseBurn: todayNutrition.exerciseBurn || 0,
      proteinGoal: goals.dailyProtein,
      proteinConsumed: todayNutrition.protein,
      mealsToday,
      mealHistory,
      dietPreference,
      tier
    };
  }

  /**
   * Get aggregated nutrition totals for a given date.
   */
  static async getTodayNutrition(userId, date) {
    try {
      const summary = await MealService.getDailySummary(userId, date, date);
      if (!summary || summary.length === 0) {
        return { calories: 0, protein: 0, carbs: 0, fat: 0, exerciseBurn: 0 };
      }
      const s = summary[0];
      return {
        calories: Math.round(s.calories || 0),
        protein: Math.round(s.protein || 0),
        carbs: Math.round(s.carbs || 0),
        fat: Math.round(s.fat || 0),
        exerciseBurn: 0 // Apple Health burn not available server-side; sent from client
      };
    } catch (error) {
      console.error('[HeroBrief] Error fetching today nutrition:', error.message);
      return { calories: 0, protein: 0, carbs: 0, fat: 0, exerciseBurn: 0 };
    }
  }

  /**
   * Get individual meals logged today, formatted for the prompt.
   */
  static async getTodayMeals(userId, date) {
    try {
      const meals = await MealService.getMeals(userId, { date });
      return (meals || []).map(meal => ({
        name: meal.name || 'Unknown Meal',
        calories: meal.totalNutrition?.calories?.final || meal.totalNutrition?.calories?.llm || 0,
        protein: meal.totalNutrition?.protein?.final || meal.totalNutrition?.protein?.llm || 0,
        time: this.formatTimeIST(meal.capturedAt),
        mealType: this.inferMealType(meal.capturedAt)
      }));
    } catch (error) {
      console.error('[HeroBrief] Error fetching today meals:', error.message);
      return [];
    }
  }

  /**
   * Get aggregated meal history for the past N days.
   * Returns distinct meals with frequency counts.
   */
  static async getMealHistory(userId, days) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const meals = await Meal.find({
        userId,
        deletedAt: null,
        capturedAt: { $gte: startDate }
      }).lean();

      if (!meals || meals.length === 0) return [];

      // Aggregate by meal name
      const mealMap = new Map();
      for (const meal of meals) {
        const name = meal.name || 'Unknown';
        const existing = mealMap.get(name);
        if (existing) {
          existing.frequency += 1;
        } else {
          mealMap.set(name, {
            name,
            frequency: 1,
            calories: meal.totalNutrition?.calories?.final || meal.totalNutrition?.calories?.llm || 0,
            protein: meal.totalNutrition?.protein?.final || meal.totalNutrition?.protein?.llm || 0,
            mealType: this.inferMealType(meal.capturedAt)
          });
        }
      }

      // Sort by frequency descending
      return Array.from(mealMap.values()).sort((a, b) => b.frequency - a.frequency);
    } catch (error) {
      console.error('[HeroBrief] Error fetching meal history:', error.message);
      return [];
    }
  }

  /**
   * Read the user's diet preference from their onboarding answers.
   * The question text is "Do you follow a specific diet?"
   * Returns the answer string or null if not set.
   */
  static async getDietPreference(userId) {
    try {
      // Find the diet question by text
      const dietQuestion = await Question.findOne({
        text: { $regex: /follow a specific diet/i },
        isActive: true
      }).lean();

      if (!dietQuestion) return null;

      const answer = await UserQuestion.findOne({
        userId,
        questionId: dietQuestion._id,
        deletedAt: null
      }).lean();

      if (!answer || !answer.values || answer.values.length === 0) return null;

      const value = answer.values[0];
      // "No specific diet" is effectively no preference
      if (value === 'No specific diet') return null;

      return value;
    } catch (error) {
      console.error('[HeroBrief] Error fetching diet preference:', error.message);
      return null;
    }
  }

  // -------------------------------------------------------------------
  // Tier detection
  // -------------------------------------------------------------------

  /**
   * Detect cold-start tier based on meal history.
   * Tier 0: 0 meals in history
   * Tier 1: < 7 unique days with meals
   * Tier 2: >= 7 unique days with meals
   */
  static detectTier(mealHistory) {
    if (!mealHistory || mealHistory.length === 0) return 0;

    const totalMeals = mealHistory.reduce((sum, m) => sum + m.frequency, 0);
    if (totalMeals < 7) return 1;
    return 2;
  }

  // -------------------------------------------------------------------
  // LLM generation
  // -------------------------------------------------------------------

  static async generateWithGemini(inputData) {
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
          // Cap thinking budget — light reasoning for meal selection
          // without consuming the output token budget
          thinkingConfig: { thinkingBudget: 256 }
        }
      });

      const prompt = buildPrompt(inputData);

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const response = result.response;
      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason || 'UNKNOWN';
      const text = response.text().trim();

      console.log(`[HeroBrief] Generated (${inputData.phase}, tier ${inputData.tier}, ${text.length} chars, finishReason: ${finishReason})`);
      console.log(`[HeroBrief] Text: ${text}`);

      if (finishReason !== 'STOP') {
        console.warn(`[HeroBrief] Unexpected finishReason: ${finishReason}`);
        console.warn(`[HeroBrief] Safety ratings:`, JSON.stringify(candidate?.safetyRatings));
      }

      return text;
    } catch (error) {
      this.recordFailure(inputData.userId || 'unknown');
      throw error;
    }
  }

  // -------------------------------------------------------------------
  // Circuit breaker
  // -------------------------------------------------------------------

  static isCircuitOpen(userId) {
    const key = String(userId);
    const state = circuitBreaker.get(key);
    if (!state) return false;

    if (state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      // Check if cooldown has elapsed
      if (Date.now() - state.lastFailure < CIRCUIT_BREAKER_COOLDOWN_MS) {
        return true;
      }
      // Cooldown elapsed — reset
      circuitBreaker.delete(key);
      return false;
    }
    return false;
  }

  static recordFailure(userId) {
    const key = String(userId);
    const state = circuitBreaker.get(key) || { failures: 0, lastFailure: 0 };
    state.failures += 1;
    state.lastFailure = Date.now();
    circuitBreaker.set(key, state);

    if (state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      console.warn(`[HeroBrief] Circuit breaker tripped for user ${key} after ${state.failures} failures`);
    }
  }

  static resetCircuit(userId) {
    circuitBreaker.delete(String(userId));
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  static buildFallbackResponse(phase) {
    return {
      phase,
      headline: PHASE_HEADLINES[phase],
      guidanceText: PHASE_FALLBACKS[phase],
      tier: null
    };
  }

  /**
   * Compute a hash of the key input data to detect staleness.
   * Changes when meals are logged/deleted/edited.
   */
  static async computeInputHash(userId, date) {
    try {
      const meals = await MealService.getMeals(userId, { date });
      const mealSignature = (meals || [])
        .map(m => `${m._id}:${m.totalNutrition?.calories?.final || 0}`)
        .sort()
        .join('|');

      return crypto
        .createHash('sha256')
        .update(`${userId}:${date}:${mealSignature}`)
        .digest('hex')
        .substring(0, 16); // Truncate for storage efficiency
    } catch {
      return 'unknown';
    }
  }

  static formatTimeIST(date) {
    if (!date) return '';
    const d = new Date(date);
    const istFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return istFormatter.format(d);
  }

  /**
   * Infer meal type (breakfast/lunch/dinner/snack) from the capture time (IST).
   */
  static inferMealType(capturedAt) {
    if (!capturedAt) return 'meal';
    const hour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        hour12: false
      }).format(new Date(capturedAt)),
      10
    );

    if (hour >= 5 && hour < 11) return 'breakfast';
    if (hour >= 11 && hour < 15) return 'lunch';
    if (hour >= 15 && hour < 18) return 'snack';
    return 'dinner';
  }

  /**
   * Determine which phase tabs should be active for the current time.
   * Returns an array of phases that have occurred or are current.
   */
  /**
   * Get available phase tabs for a user on a given date.
   * Only includes phases that have cached briefs + the current active phase.
   * Returns objects: [{ phase, label }] where the current phase is labeled "Now".
   */
  static async getAvailablePhaseTabs(userId, date) {
    const todayIST = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    const isToday = date === todayIST;

    if (!isToday) {
      // Past days: no tabs (will show "Day Summary" on frontend)
      return [];
    }

    const currentPhase = getCurrentPhaseIST();
    const phaseOrder = ['morning', 'midday', 'evening'];
    const phaseLabels = { morning: 'Dawn', midday: 'Day', evening: 'Evening' };

    // Query which briefs exist for this user+date
    const existingBriefs = await HeroBrief.find(
      { userId, date },
      { phase: 1 }
    ).lean();
    const cachedPhases = new Set(existingBriefs.map(b => b.phase));

    // Build tabs: only phases with cached briefs + current phase
    const tabs = [];
    for (const phase of phaseOrder) {
      if (phase === currentPhase) {
        // Current phase is always shown, labeled "Now"
        tabs.push({ phase, label: 'Now' });
        break; // Don't show future phases
      }
      if (cachedPhases.has(phase)) {
        tabs.push({ phase, label: phaseLabels[phase] });
      }
    }

    return tabs;
  }
}

module.exports = HeroBriefService;
