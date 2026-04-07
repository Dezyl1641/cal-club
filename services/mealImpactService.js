const { GoogleGenerativeAI } = require('@google/generative-ai');
const Meal = require('../models/schemas/Meal');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

class MealImpactService {
  /**
   * Analyze meal impact: satiety, glucose response, and small swaps.
   * Also returns enrichment data (fiber, GI) for DB persistence.
   * @param {Object} meal - Mongoose Meal document
   * @returns {{ satiety, glucoseImpact, smallSwaps, enrichment }}
   */
  static async analyzeMealImpact(meal) {
    const items = meal.items.map(item => ({
      name: item.name?.final || item.name?.llm || 'Unknown',
      calories: Math.round(item.nutrition?.calories?.final || item.nutrition?.calories?.llm || 0),
      protein: Math.round((item.nutrition?.protein?.final || item.nutrition?.protein?.llm || 0) * 10) / 10,
      carbs: Math.round((item.nutrition?.carbs?.final || item.nutrition?.carbs?.llm || 0) * 10) / 10,
      fat: Math.round((item.nutrition?.fat?.final || item.nutrition?.fat?.llm || 0) * 10) / 10,
      quantity: item.displayQuantity?.final?.value || item.displayQuantity?.llm?.value || 1,
      unit: item.displayQuantity?.final?.unit || item.displayQuantity?.llm?.unit || 'piece',
    }));

    const totalNutrition = {
      calories: Math.round(meal.totalNutrition?.calories?.final || meal.totalNutrition?.calories?.llm || 0),
      protein: Math.round((meal.totalNutrition?.protein?.final || meal.totalNutrition?.protein?.llm || 0) * 10) / 10,
      carbs: Math.round((meal.totalNutrition?.carbs?.final || meal.totalNutrition?.carbs?.llm || 0) * 10) / 10,
      fat: Math.round((meal.totalNutrition?.fat?.final || meal.totalNutrition?.fat?.llm || 0) * 10) / 10,
    };

    try {
      const result = await this._callGemini(items, totalNutrition);
      return result;
    } catch (error) {
      console.error('❌ [MealImpact] Gemini call failed, returning defaults:', error.message);
      return this._getDefaults();
    }
  }

  static async _callGemini(items, totalNutrition) {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1500,
        responseMimeType: 'application/json',
      }
    });

    const itemsSummary = items.map(i =>
      `- ${i.name}: ${i.quantity} ${i.unit}, ${i.calories} cal, ${i.protein}g protein, ${i.carbs}g carbs, ${i.fat}g fat`
    ).join('\n');

    const prompt = `You are an expert nutritionist. Analyze this meal and return a JSON response with four sections.

MEAL ITEMS:
${itemsSummary}

TOTAL: ${totalNutrition.calories} cal, ${totalNutrition.protein}g protein, ${totalNutrition.carbs}g carbs, ${totalNutrition.fat}g fat

INSTRUCTIONS:

1. SATIETY ANALYSIS
Assess how long this meal will keep someone full based on:
- Protein content (strongest satiety driver)
- Fat content (slows gastric emptying)
- Fiber content of the specific foods (e.g., dal has fiber, white rice doesn't)
- Total caloric volume
Return one of three levels:
- "low" with hours "1-2 hours" — low protein/fat, mostly simple carbs
- "medium" with hours "2-3 hours" — moderate balance
- "high" with hours "4-5 hours" — high protein/fat/fiber

2. GLUCOSE IMPACT ANALYSIS
Model the blood glucose response considering:
- Glycemic index of each specific food item (e.g., white rice=73, oats=55, dal=29)
- Total carb load (glycemic load = GI × carb grams / 100)
- Protein and fat moderation effect (slow absorption)
- Food combination effects (e.g., fat + fiber with high-GI food blunts the spike)

Generate two 6-point glucose curves (mg/dL values at 0, 15, 30, 45, 60, 90 minutes):
- "withoutWalk": natural glucose response
- "withWalk": response if a 10-minute walk is taken after eating (reduces spike by ~15-20%)
- Both curves must start near 100 (baseline fasting glucose)
- The peak should be realistic: 120-140 for moderate, 140-170 for high-GI heavy meals, 105-120 for low-GI meals

Classify as:
- "Likely Spike" — peak > 145 mg/dL
- "Moderate" — peak 120-145 mg/dL
- "Minimal" — peak < 120 mg/dL

3. SMALL SWAPS
Suggest 1-3 realistic food swaps that would improve nutrition (more protein, fewer calories, lower GI, or more fiber). Only suggest commonly available alternatives. If no meaningful swaps exist, return an empty array.

4. NUTRITION ENRICHMENT
For each meal item, provide estimated fiber (grams) and glycemic index (0-100 scale). This data is used for analytics, not shown to the user, so be as accurate as possible.

RESPONSE FORMAT (strict JSON):
{
  "satiety": {
    "hours": "2-3 hours",
    "label": "Explanation of why this meal has this satiety level",
    "level": "medium"
  },
  "glucoseImpact": {
    "label": "Moderate",
    "description": "Explanation of the glucose response for this specific meal",
    "withoutWalk": [100, 115, 130, 135, 125, 110],
    "withWalk": [100, 110, 120, 125, 118, 105],
    "tips": ["Actionable tip 1", "Actionable tip 2"]
  },
  "smallSwaps": [
    {
      "currentItem": "Original item name",
      "currentCalories": 200,
      "currentProtein": 5,
      "swapItem": "Suggested replacement",
      "swapCalories": 180,
      "swapProtein": 8,
      "savingsLabel": "Short benefit description"
    }
  ],
  "itemNutritionEnrichment": [
    {
      "itemName": "Item name exactly as given",
      "fiber": 2.1,
      "glycemicIndex": 62
    }
  ]
}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const responseText = result.response.text().trim();
    console.log(`🧠 [MealImpact] Gemini response length: ${responseText.length}`);

    const parsed = JSON.parse(responseText);

    // Validate and normalize the response
    const satiety = {
      hours: String(parsed.satiety?.hours || '2-3 hours'),
      label: String(parsed.satiety?.label || 'This meal has moderate satiety'),
      level: ['low', 'medium', 'high'].includes(parsed.satiety?.level) ? parsed.satiety.level : 'medium',
    };

    const glucoseImpact = {
      label: String(parsed.glucoseImpact?.label || 'Moderate'),
      description: String(parsed.glucoseImpact?.description || ''),
      withoutWalk: this._normalizeGlucoseCurve(parsed.glucoseImpact?.withoutWalk),
      withWalk: this._normalizeGlucoseCurve(parsed.glucoseImpact?.withWalk),
      tips: Array.isArray(parsed.glucoseImpact?.tips)
        ? parsed.glucoseImpact.tips.map(t => String(t))
        : [],
    };

    const smallSwaps = Array.isArray(parsed.smallSwaps)
      ? parsed.smallSwaps.map(swap => ({
          currentItem: String(swap.currentItem || ''),
          currentCalories: Math.round(Number(swap.currentCalories) || 0),
          currentProtein: Math.round(Number(swap.currentProtein) || 0),
          swapItem: String(swap.swapItem || ''),
          swapCalories: Math.round(Number(swap.swapCalories) || 0),
          swapProtein: Math.round(Number(swap.swapProtein) || 0),
          savingsLabel: String(swap.savingsLabel || ''),
        }))
      : [];

    const enrichment = Array.isArray(parsed.itemNutritionEnrichment)
      ? parsed.itemNutritionEnrichment.map(item => ({
          itemName: String(item.itemName || ''),
          fiber: Number(item.fiber) || 0,
          glycemicIndex: Math.round(Number(item.glycemicIndex) || 0),
        }))
      : [];

    return { satiety, glucoseImpact, smallSwaps, enrichment };
  }

  /**
   * Ensure glucose curve is exactly 6 numeric points starting near baseline
   */
  static _normalizeGlucoseCurve(curve) {
    if (!Array.isArray(curve) || curve.length === 0) {
      return [100, 110, 120, 125, 115, 105];
    }
    // Ensure exactly 6 points, all numbers
    const normalized = curve.slice(0, 6).map(v => Math.round(Number(v) || 100));
    while (normalized.length < 6) {
      normalized.push(100);
    }
    return normalized;
  }

  /**
   * Save fiber and GI enrichment data back to the meal document.
   * Fire-and-forget — does not throw on failure.
   */
  static async saveEnrichmentData(meal, enrichmentData) {
    try {
      if (!enrichmentData || enrichmentData.length === 0) return;

      let totalFiber = 0;
      const updateOps = {};

      for (let i = 0; i < meal.items.length; i++) {
        const mealItem = meal.items[i];
        const itemName = mealItem.name?.final || mealItem.name?.llm || '';

        // Match by name (case-insensitive)
        const enrichment = enrichmentData.find(
          e => e.itemName.toLowerCase() === itemName.toLowerCase()
        );

        if (enrichment) {
          updateOps[`items.${i}.nutrition.fiber.llm`] = Math.round(enrichment.fiber * 10) / 10;
          updateOps[`items.${i}.glycemicIndex.llm`] = enrichment.glycemicIndex;
          totalFiber += enrichment.fiber;
        }
      }

      if (Object.keys(updateOps).length > 0) {
        updateOps['totalNutrition.fiber.llm'] = Math.round(totalFiber * 10) / 10;

        await Meal.updateOne(
          { _id: meal._id },
          { $set: updateOps }
        );
        console.log(`✅ [MealImpact] Saved fiber/GI enrichment for meal ${meal._id} (${Object.keys(updateOps).length} fields)`);
      }
    } catch (error) {
      console.error(`⚠️ [MealImpact] Failed to save enrichment data for meal ${meal._id}:`, error.message);
    }
  }

  /**
   * Safe defaults when Gemini call fails
   */
  static _getDefaults() {
    return {
      satiety: {
        hours: '2-3 hours',
        label: 'Unable to analyze satiety for this meal',
        level: 'medium',
      },
      glucoseImpact: {
        label: 'Moderate',
        description: 'Unable to analyze glucose impact for this meal',
        withoutWalk: [100, 110, 120, 125, 115, 105],
        withWalk: [100, 105, 115, 118, 110, 102],
        tips: ['Take a short walk after eating to help manage glucose levels'],
      },
      smallSwaps: [],
      enrichment: [],
    };
  }
}

module.exports = MealImpactService;
