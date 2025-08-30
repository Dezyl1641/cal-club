const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Meal = require('../models/schemas/Meal');
//test
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

class AiService {
  static async fetchImageAsBase64(url) {
    const https = require('https');
    return new Promise((resolve, reject) => {
      https.get(url, (resp) => {
        let data = [];
        resp.on('data', (chunk) => data.push(chunk));
        resp.on('end', () => {
          const buffer = Buffer.concat(data);
          resolve(buffer.toString('base64'));
        });
      }).on('error', reject);
    });
  }

  static async analyzeFoodWithOpenAI(imageUrl) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a nutrition expert. Analyze food photos and return structured JSON data with detailed nutrition information.'
        },
        {
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: `Analyze this food photo and return a JSON object with the following structure:
{
  "mealName": "Overall meal name (e.g., 'Dal & Rice', 'Banana, Apple and Eggs')",
  "items": [
    {
      "name": "Item name",
      "quantity": {
        "value": 6,
        "unit": "slices/pieces/cups/grams/etc"
      },
      "nutrition": {
        "calories": 900,
        "protein": 30,
        "carbs": 150,
        "fat": 18
      },
      "confidence": 0.85
    }
  ]
}

IMPORTANT: For each item, provide the TOTAL quantity and nutrition for ALL of that item visible in the photo. For example:
- If you see 6 pizza slices, return quantity: 6, unit: "slices" and nutrition for all 6 slices combined
- If you see 3 apples, return quantity: 3, unit: "pieces" and nutrition for all 3 apples combined
- If you see 2 cups of rice, return quantity: 2, unit: "cups" and nutrition for all 2 cups combined

For each item, provide a confidence score between 0 and 1 indicating how certain you are about the identification and nutrition estimates. Higher values indicate more confidence.

Return only valid JSON, no additional text.` 
            },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });
    return completion.choices[0].message.content;
  }

  static async analyzeFoodWithGemini(imageUrl) {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `You are a nutrition expert. Analyze this food photo and return a JSON object with the following structure:

{
  "mealName": "Overall meal name (e.g., 'Dal & Rice', 'Banana, Apple and Eggs')",
  "items": [
    {
      "name": "Item name",
      "quantity": {
        "value": 6,
        "unit": "slices/pieces/cups/grams/etc"
      },
      "nutrition": {
        "calories": 900,
        "protein": 30,
        "carbs": 150,
        "fat": 18
      },
      "confidence": 0.85
    }
  ]
}

IMPORTANT: For each item, provide the TOTAL quantity and nutrition for ALL of that item visible in the photo. For example:
- If you see 6 pizza slices, return quantity: 6, unit: "slices" and nutrition for all 6 slices combined
- If you see 3 apples, return quantity: 3, unit: "pieces" and nutrition for all 3 apples combined
- If you see 2 cups of rice, return quantity: 2, unit: "cups" and nutrition for all 2 cups combined

For each item, provide a confidence score between 0 and 1 indicating how certain you are about the identification and nutrition estimates. Higher values indicate more confidence.

Return only valid JSON, no additional text.`;
    
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: await this.fetchImageAsBase64(imageUrl) } }
          ]
        }
      ]
    });
    return result.response.text();
  }

  static async analyzeFoodItemWithOpenAI(itemName, currentMealName, previousItemName, originalUnit) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a nutrition expert. Provide nutrition information for food items and suggest updated meal names.'
        },
        {
          role: 'user',
          content: `A user is updating a meal item. Please provide nutrition information for the new item and suggest an updated meal name.

Current meal name: "${currentMealName}"
Previous item name: "${previousItemName}"
New item name: "${itemName}"
Original quantity unit: "${originalUnit}"

Return JSON with this structure:
{
  "name": "${itemName}",
  "quantity": {
    "value": 1,
    "unit": "${originalUnit}"
  },
  "nutrition": {
    "calories": 150,
    "protein": 10,
    "carbs": 20,
    "fat": 5
  },
  "updatedMealName": "Updated meal name reflecting the change"
}

Guidelines:
1. Provide realistic nutrition values for a typical serving of ${itemName} using the unit "${originalUnit}"
2. For the updatedMealName, consider how replacing "${previousItemName}" with "${itemName}" would change the overall meal description
3. Keep the meal name concise but descriptive
4. If the change is minor, you can keep the same meal name
5. Focus on the most significant change in the meal
6. ALWAYS use the original unit "${originalUnit}" in the quantity field

Examples:
- If changing "White Rice" to "Brown Rice" in "Chicken and Rice Bowl" → "Chicken and Brown Rice Bowl"
- If changing "Apple" to "Banana" in "Fruit Salad" → "Fruit Salad with Banana"
- If changing "Chicken Breast" to "Salmon" in "Grilled Chicken Salad" → "Grilled Salmon Salad"

Return only valid JSON, no additional text.`
        }
      ],
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });
    return completion.choices[0].message.content;
  }

  static async analyzeFoodCalories(imageUrl, provider = 'openai', userId = null, additionalData = {}) {
    try {
      let result;
      let llmModel;
      
      if (provider === 'gemini') {
        result = await this.analyzeFoodWithGemini(imageUrl);
        llmModel = 'gemini-1.5-flash';
      } else {
        result = await this.analyzeFoodWithOpenAI(imageUrl);
        llmModel = 'gpt-4o';
      }
      
      // Save meal data to database if userId is provided
      let savedMeal = null;
      console.log('userId', userId);
      if (userId) {
        savedMeal = await this.saveMealData(userId, imageUrl, result, provider, llmModel, additionalData);
      }
      
      return { 
        calories: result, 
        provider,
        mealId: savedMeal ? savedMeal._id : null
      };
    } catch (error) {
      throw new Error(`Failed to analyze image: ${error.message}`);
    }
  }

  static async saveMealData(userId, imageUrl, aiResult, provider, llmModel, additionalData = {}) {
    try {
      // Parse structured JSON response from AI
      const parsedResult = this.parseAIResult(aiResult);
      
      // Calculate total nutrition from items
      const totalNutrition = this.calculateTotalNutrition(parsedResult.items);
      
      // Convert items to meal schema format
      const mealItems = parsedResult.items.map((item, index) => ({
        id: `item_${Date.now()}_${index}`, // Generate unique ID
        name: {
          llm: item.name,
          final: null
        },
        quantity: {
          llm: {
            value: item.quantity.value,
            unit: item.quantity.unit,
            normalized: {
              value: item.quantity.value,
              unit: item.quantity.unit
            }
          },
          final: {
            value: null,
            unit: null
          }
        },
        nutrition: {
          calories: { llm: item.nutrition.calories, final: null },
          protein: { llm: item.nutrition.protein, final: null },
          carbs: { llm: item.nutrition.carbs, final: null },
          fat: { llm: item.nutrition.fat, final: null }
        },
        confidence: item.confidence || null // Use AI confidence or default to null
      }));
      
      const mealData = {
        userId,
        capturedAt: additionalData.capturedAt || new Date(),
        photos: [{
          url: imageUrl,
          width: additionalData.width || null,
          height: additionalData.height || null
        }],
        llmVersion: '1.0',
        llmModel,
        name: parsedResult.mealName,
        totalNutrition: {
          calories: { llm: totalNutrition.calories, final: null },
          protein: { llm: totalNutrition.protein, final: null },
          carbs: { llm: totalNutrition.carbs, final: null },
          fat: { llm: totalNutrition.fat, final: null }
        },
        items: mealItems,
        notes: additionalData.notes || `AI Analysis: ${parsedResult.mealName}`,
        userApproved: false
      };

      const meal = new Meal(mealData);
      return await meal.save();
    } catch (error) {
      console.error('Failed to save meal data:', error);
      throw new Error(`Failed to save meal data: ${error.message}`);
    }
  }

  static parseAIResult(aiResult) {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(aiResult);
      
      // Validate required fields
      if (!parsed.mealName || !parsed.items || !Array.isArray(parsed.items)) {
        throw new Error('Invalid JSON structure: missing mealName or items array');
      }
      
      return parsed;
    } catch (error) {
      console.error('Failed to parse AI result as JSON:', error);
      console.log('Raw AI result:', aiResult);
      
      // Fallback to old parsing method for backward compatibility
      const calories = this.extractCaloriesFromAIResult(aiResult);
      return {
        mealName: 'Unknown Meal',
        items: [{
          name: 'Unknown Item',
          quantity: { value: 1, unit: 'serving' },
          nutrition: {
            calories: calories || 0,
            protein: 0,
            carbs: 0,
            fat: 0
          },
          confidence: null
        }]
      };
    }
  }

  static calculateTotalNutrition(items) {
    return items.reduce((total, item) => {
      return {
        calories: (total.calories || 0) + (item.nutrition.calories || 0),
        protein: (total.protein || 0) + (item.nutrition.protein || 0),
        carbs: (total.carbs || 0) + (item.nutrition.carbs || 0),
        fat: (total.fat || 0) + (item.nutrition.fat || 0)
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  }

  static extractCaloriesFromAIResult(aiResult) {
    // Simple regex to extract calories from AI response
    // This can be enhanced based on your specific AI response format
    const calorieMatch = aiResult.match(/(\d+)\s*calories?/i);
    return calorieMatch ? parseInt(calorieMatch[1]) : null;
  }
}

module.exports = AiService; 