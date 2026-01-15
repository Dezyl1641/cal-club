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

  static async analyzeFoodWithOpenAI(imageUrl, hint) {
    // Build prompt based on what's available
    let promptText = '';

    // Adjust prompt based on available inputs
    if (imageUrl && hint) {
      // IMAGE + TEXT CASE
      promptText = `### ROLE
You are an expert AI Nutritionist and Computer Vision Analyst. Your goal is to analyze food images with high precision to assist in dietary tracking.

### INPUT DATA
1. *Image:* Photo of a meal (served state).
2. *User Hint:* "${hint}"

### INSTRUCTIONS

1. *Visual Analysis & Scale Calibration:*
   * *Identify Anchors:* Scan the image for "intrinsic" reference objects to determine physical scale. Look for standard cutlery (forks ~20cm), glassware, or standard dinner plates (25-28cm). Use these to estimate the actual volume of the food.
   * *Texture Analysis:* Analyze surface texture and glossiness. High sheen indicates added oils/butters/glazes. You must account for these "hidden calories" in your macro estimation.

2. *Item Identification & Context Integration:*
   * *Identify All Items:* Segment the image and identify every distinct food item visible on the plate.
   * *Context Usage:* Use the *User Hint* to resolve specific ambiguities (e.g., "made with oat milk" vs "cow milk").
   * *Conflict Resolution:* If the User Hint contradicts strong visual evidence (e.g., User says "Salad" but image shows "Pizza"), *prioritize the Visual Evidence* for identification to prevent false tracking.

3. *Scientific Calculation (Cooked vs. Raw):*
   * *State Detection:* Assume items are in their *COOKED/SERVED* state unless obviously raw (like fruit).
   * *Database Matching:* Match estimated volumes to *Cooked* database values (e.g., "Steamed Rice", not "Raw Rice").
   * *Yield Logic:* If a cooked value is unavailable, estimate the raw weight by applying standard cooking yield factors (e.g., meat shrinks by ~25%, rice expands by ~3x) before calculating macros.

4. *Quantification (User-Friendly):*
   * Estimate portion sizes using volume-based, user-friendly terms.
   * Preferred Units: Cups, tablespoons, slices, pieces, "fist-sized", "palm-sized".
   * Avoid giving specific gram weights unless the user provided them, as visual weight estimation is prone to error.

### OUTPUT FORMAT
Return ONLY a raw JSON object with this exact structure:

{
  "mealName": "Overall meal name (e.g., 'Dal & Rice', 'Grilled Chicken Breast')",
  "items": [
    {
      "name": "Item Name (e.g., Grilled Chicken Breast)",
      "quantity": {
        "value": 1,
        "unit": "palm-sized piece/cups/slices/pieces/etc"
      },
      "nutrition": {
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0
      },
      "confidence": 0.0-1.0
    }
  ]
}

Return only valid JSON, no additional text.`;
    } else if (hint && !imageUrl) {
      // TEXT ONLY CASE
      promptText = `### ROLE
You are an expert AI Nutritionist and Database Specialist. Your goal is to parse natural language food logs into structured nutritional data.

### INPUT DATA
User text string: "${hint}"

### INSTRUCTIONS

1. *Entity & Quantity Extraction:*
   * Parse the text to identify the *Food Item* and the *Quantity/Unit*.
   * Default Logic: If quantity is unspecified (e.g., "an apple"), assume *1 Standard Serving* (e.g., 1 Medium Apple).

2. *Brand vs. Generic Logic:*
   * *Explicit Brand:* If the user names a brand (e.g., "The Whole Truth," "MyProtein," "McDonald's"), you MUST prioritize searching your internal knowledge base for that specific brand's nutritional values.
     * Note on Scoops: Brand-specific scoops vary (e.g., one scoop might be 30g, another 45g). Use the specific brand's standard serving size.
   * *Generic:* If no brand is mentioned (e.g., "one apple," "boiled egg"), use standard USDA-equivalent averages for a *Medium* size.

3. *Macro Calculation:*
   * Calculate Calories, Protein, Carbs, and Fats based on the extracted quantity.
   * Sum up the total meal values.

### OUTPUT FORMAT
Return ONLY a raw JSON object with this exact structure:

{
  "mealName": "Overall meal name (e.g., 'The Whole Truth Protein Shake', 'Banana and Eggs')",
  "items": [
    {
      "name": "Item Name (e.g., The Whole Truth Protein - Chocolate)",
      "quantity": {
        "value": 1,
        "unit": "Scoop/piece/cup/serving/etc"
      },
      "nutrition": {
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0
      },
      "confidence": 0.0-1.0
    }
  ]
}

Return only valid JSON, no additional text.`;
    } else {
      // IMAGE ONLY CASE (default)
      promptText = `### ROLE
You are an expert AI Nutritionist and Computer Vision Analyst. Your goal is to analyze food images with high precision to assist in dietary tracking.

### INPUT DATA
*Image:* Photo of a meal (served state).

### INSTRUCTIONS

1. *Visual Analysis & Scale Calibration:*
   * *Identify Anchors:* Scan the image for "intrinsic" reference objects to determine physical scale. Look for standard cutlery (forks ~20cm), glassware, or standard dinner plates (25-28cm). Use these to estimate the actual volume of the food.
   * *Texture Analysis:* Analyze surface texture and glossiness. High sheen indicates added oils/butters/glazes. You must account for these "hidden calories" in your macro estimation.

2. *Item Identification:*
   * *Identify All Items:* Segment the image and identify every distinct food item visible on the plate.

3. *Scientific Calculation (Cooked vs. Raw):*
   * *State Detection:* Assume items are in their *COOKED/SERVED* state unless obviously raw (like fruit).
   * *Database Matching:* Match estimated volumes to *Cooked* database values (e.g., "Steamed Rice", not "Raw Rice").
   * *Yield Logic:* If a cooked value is unavailable, estimate the raw weight by applying standard cooking yield factors (e.g., meat shrinks by ~25%, rice expands by ~3x) before calculating macros.

4. *Quantification (User-Friendly):*
   * Estimate portion sizes using volume-based, user-friendly terms.
   * Preferred Units: Cups, tablespoons, slices, pieces, "fist-sized", "palm-sized".
   * Avoid giving specific gram weights as visual weight estimation is prone to error.

### OUTPUT FORMAT
Return ONLY a raw JSON object with this exact structure:

{
  "mealName": "Overall meal name (e.g., 'Dal & Rice', 'Grilled Chicken Breast')",
  "items": [
    {
      "name": "Item Name (e.g., Grilled Chicken Breast)",
      "quantity": {
        "value": 1,
        "unit": "palm-sized piece/cups/slices/pieces/etc"
      },
      "nutrition": {
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0
      },
      "confidence": 0.0-1.0
    }
  ]
}

Return only valid JSON, no additional text.`;
    }

    const content = [
      { 
        type: 'text', 
        text: promptText
      }
    ];

    // Add image if URL is provided
    if (imageUrl) {
      content.push({ type: 'image_url', image_url: { url: imageUrl } });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: imageUrl 
            ? 'You are a nutrition expert. Analyze food photos and return structured JSON data with detailed nutrition information.'
            : 'You are a nutrition expert. Analyze food descriptions and return structured JSON data with detailed nutrition information.'
        },
        {
          role: 'user',
          content: content
        }
      ],
      max_tokens: 1000,
      temperature: 0.1,
      response_format: { type: "json_object" }
    });
    return completion.choices[0].message.content;
  }

  static async analyzeFoodWithGemini(imageUrl, hint) {
    // Use gemini-2.5-flash as requested
    const modelName = 'gemini-2.5-flash';
    console.log(`🤖 [GEMINI] Using model: ${modelName}`);
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      generationConfig: {
        temperature: 0.1
      }
    });
    
    // Build prompt based on what's available
    let prompt = '';
    const parts = [];

    if (imageUrl && hint) {
      // IMAGE + TEXT CASE
      prompt = `### ROLE
You are an expert AI Nutritionist and Computer Vision Analyst. Your goal is to analyze food images with high precision to assist in dietary tracking.

### INPUT DATA
1. *Image:* Photo of a meal (served state).
2. *User Hint:* "${hint}"

### INSTRUCTIONS

1. *Visual Analysis & Scale Calibration:*
   * *Identify Anchors:* Scan the image for "intrinsic" reference objects to determine physical scale. Look for standard cutlery (spoons ~14-16cm), glassware, or standard dinner plates (25-28cm), or standard food item sizes. Use these to estimate the actual volume of the food.
   * *Texture Analysis:* Analyze surface texture and glossiness. High sheen indicates added oils/butters/glazes. You must account for these "hidden calories" in your macro estimation.

2. *Item Identification & Context Integration:*
   * *Identify All Items:* Segment the image and identify every distinct food item visible on the plate.
   * *Be Specific:* Don't be generic in identifying items as calorie values differ (e.g., "bread" vs "sourdough bread").
   * *Context Usage:* Use the *User Hint* to resolve specific ambiguities (e.g., "made with oat milk" vs "cow milk").
   * *Conflict Resolution:* If the User Hint contradicts strong visual evidence (e.g., User says "Salad" but image shows "Pizza"), *prioritize the User Hint* for identification to prevent false tracking.

3. *Component Breakdown for Composite Dishes:*
   * *When to Apply:* For named composite dishes where items are cooked/mixed together (e.g., Biryani, Curry with protein, Pasta dishes), break into key components.
   * *Format:* List each component separately as: "Component (dish name)". Example: "Chicken (chicken biryani)" and "Rice (chicken biryani)".
   * *Key Components Only:* Separate base carb + protein + sauce/gravy (if substantial). Do NOT break curry/sauce into micro-ingredients (tomato, onion, spices).
   * *When NOT to Apply:* If items are already visually distinct/separate on plate (e.g., Thali), list without parentheses: "Rice", "Dal", "Sabzi".

4. *Scientific Calculation (Cooked vs. Raw):*
   * *State Detection:* Assume items are in their *COOKED/SERVED* state unless obviously raw (like fruit).
   * *Database Matching:* Match estimated volumes to *Cooked* database values (e.g., "Steamed Rice", not "Raw Rice").
   * *Yield Logic:* If a cooked value is unavailable, estimate the raw weight by applying standard cooking yield factors (e.g., meat shrinks by ~25%, rice expands by ~3x) before calculating macros.

5. *Quantification (User-Friendly & Editable):*
   * For PROTEINS (meat, fish, paneer, tofu, eggs): Use format "[count] [unit] ([grams])"
     - Examples: "3 pieces (150 gms)", "1 breast (180 gms)", "8 cubes (100 gms)", "6 shrimp (120 gms)"
     - For non-countable proteins: "150 gms minced", "120 gms shredded"
   * For CARBS: Use countable (pieces, slices) or volume (cups, katoris)
     - Examples: "2 pieces" (roti), "1.5 cups" (rice), "3 slices" (bread)
   * For VEGETABLES: Use countable (florets, pieces) or volume (katoris, cups)
     - Examples: "6 florets" (broccoli), "1 katori" (sabzi), "1/2 cup" (salad)
   * For SAUCES/GRAVIES: Use volume (katoris, cups, tbsp)
     - Examples: "1 katori" (curry gravy), "3 tbsp" (dressing)
   * AVOID vague descriptions: No "palm-sized", "fist-sized", "deck of cards", "tennis ball sized", or any comparison-based measurements
   * All quantities must be concrete, measurable, and editable by the user

### OUTPUT FORMAT
Return ONLY a raw JSON object with this exact structure:

{
  "mealName": "Overall meal name (e.g., 'Dal & Rice', 'Chicken Biryani')",
  "items": [
    {
      "name": "Item Name (e.g., Grilled Chicken Breast)",
      "quantity": {
        "value": 1,
        "unit": "breast (180 gms)/cups/pieces/katori/etc"
      },
      "nutrition": {
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0
      },
      "confidence": 0.0-1.0
    }
  ]
}

Return only valid JSON, no additional text.`;
      parts.push({ text: prompt });
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: await this.fetchImageAsBase64(imageUrl) } });
    } else if (imageUrl && !hint) {
      // IMAGE ONLY CASE
      prompt = `### ROLE
You are an expert AI Nutritionist and Computer Vision Analyst. Your goal is to analyze food images with high precision to assist in dietary tracking.

### INPUT DATA
*Image:* Photo of a meal (served state).

### INSTRUCTIONS

1. *Visual Analysis & Scale Calibration:*
   * *Identify Anchors:* Scan the image for "intrinsic" reference objects to determine physical scale. Look for standard cutlery (spoons ~14-16cm), glassware, or standard dinner plates (25-28cm), or standard food item sizes. Use these to estimate the actual volume of the food.
   * *Texture Analysis:* Analyze surface texture and glossiness. High sheen indicates added oils/butters/glazes. You must account for these "hidden calories" in your macro estimation.

2. *Item Identification:*
   * *Identify All Items:* Segment the image and identify every distinct food item visible on the plate.
   * *Be Specific:* Don't be generic in identifying items as calorie values differ (e.g., "bread" vs "sourdough bread").

3. *Component Breakdown for Composite Dishes:*
   * *When to Apply:* For named composite dishes where items are cooked/mixed together (e.g., Biryani, Curry with protein, Pasta dishes), break into key components.
   * *Format:* List each component separately as: "Component (dish name)". Example: "Chicken (chicken biryani)" and "Rice (chicken biryani)".
   * *Key Components Only:* Separate base carb + protein + sauce/gravy (if substantial). Do NOT break curry/sauce into micro-ingredients (tomato, onion, spices).
   * *When NOT to Apply:* If items are already visually distinct/separate on plate (e.g., Thali), list without parentheses: "Rice", "Dal", "Sabzi".

4. *Scientific Calculation (Cooked vs. Raw):*
   * *State Detection:* Assume items are in their *COOKED/SERVED* state unless obviously raw (like fruit).
   * *Database Matching:* Match estimated volumes to *Cooked* database values (e.g., "Steamed Rice", not "Raw Rice").
   * *Yield Logic:* If a cooked value is unavailable, estimate the raw weight by applying standard cooking yield factors (e.g., meat shrinks by ~25%, rice expands by ~3x) before calculating macros.

5. *Quantification (User-Friendly & Editable):*
   * For PROTEINS (meat, fish, paneer, tofu, eggs): Use format "[count] [unit] ([grams])"
     - Examples: "3 pieces (150 gms)", "1 breast (180 gms)", "8 cubes (100 gms)", "6 shrimp (120 gms)"
     - For non-countable proteins: "150 gms minced", "120 gms shredded"
   * For CARBS: Use countable (pieces, slices) or volume (cups, katoris)
     - Examples: "2 pieces" (roti), "1.5 cups" (rice), "3 slices" (bread)
   * For VEGETABLES: Use countable (florets, pieces) or volume (katoris, cups)
     - Examples: "6 florets" (broccoli), "1 katori" (sabzi), "1/2 cup" (salad)
   * For SAUCES/GRAVIES: Use volume (katoris, cups, tbsp)
     - Examples: "1 katori" (curry gravy), "3 tbsp" (dressing)
   * AVOID vague descriptions: No "palm-sized", "fist-sized", "deck of cards", "tennis ball sized", or any comparison-based measurements
   * All quantities must be concrete, measurable, and editable by the user

### OUTPUT FORMAT
Return ONLY a raw JSON object with this exact structure:

{
  "mealName": "Overall meal name (e.g., 'Dal & Rice', 'Chicken Biryani')",
  "items": [
    {
      "name": "Item Name (e.g., Grilled Chicken Breast)",
      "quantity": {
        "value": 1,
        "unit": "breast (180 gms)/cups/pieces/katori/etc"
      },
      "nutrition": {
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0
      },
      "confidence": 0.0-1.0
    }
  ]
}

Return only valid JSON, no additional text.`;
      parts.push({ text: prompt });
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: await this.fetchImageAsBase64(imageUrl) } });
    } else if (hint && !imageUrl) {
      // TEXT ONLY CASE
      prompt = `### ROLE
You are an expert AI Nutritionist and Database Specialist. Your goal is to parse natural language food logs into structured nutritional data.

### INPUT DATA
User text string: "${hint}"

### INSTRUCTIONS

1. *Entity & Quantity Extraction:*
   * Parse the text to identify the *Food Item* and the *Quantity/Unit*.
   * Default Logic: If quantity is unspecified (e.g., "an apple"), assume *1 Standard Serving* (e.g., 1 Medium Apple).

2. *Brand vs. Generic Logic:*
   * *Explicit Brand:* If the user names a brand (e.g., "The Whole Truth," "MyProtein," "McDonald's"), you MUST prioritize searching your internal knowledge base for that specific brand's nutritional values.
     * Note on Scoops: Brand-specific scoops vary (e.g., one scoop might be 30g, another 45g). Use the specific brand's standard serving size.
   * *Generic:* If no brand is mentioned (e.g., "one apple," "boiled egg"), use standard USDA-equivalent averages for a *Medium* size.

3. *Macro Calculation:*
   * Calculate Calories, Protein, Carbs, and Fats based on the extracted quantity.
   * Sum up the total meal values.

### OUTPUT FORMAT
Return ONLY a raw JSON object with this exact structure:

{
  "mealName": "Overall meal name (e.g., 'The Whole Truth Protein Shake', 'Banana and Eggs')",
  "items": [
    {
      "name": "Item Name (e.g., The Whole Truth Protein - Chocolate)",
      "quantity": {
        "value": 1,
        "unit": "Scoop/piece/cup/serving/etc"
      },
      "nutrition": {
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0
      },
      "confidence": 0.0-1.0
    }
  ]
}

Return only valid JSON, no additional text.`;
      parts.push({ text: prompt });
    }
    
    try {
      console.log(`🤖 [GEMINI] Sending request with ${parts.length} parts`);
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: parts
          }
        ]
      });
      
      const responseText = result.response.text();
      console.log(`🤖 [GEMINI] Response received, length: ${responseText?.length || 0}`);
      console.log(`🤖 [GEMINI] Raw response preview: ${responseText?.substring(0, 200)}...`);
      
      if (!responseText || responseText.trim() === '') {
        console.error('❌ [GEMINI] Empty response received');
        throw new Error('Empty response from Gemini API');
      }
      
      return responseText;
    } catch (error) {
      console.error('❌ [GEMINI] API Error:', error.message);
      console.error('❌ [GEMINI] Full error:', error);
      throw error;
    }
  }

  static async analyzeFoodItemWithOpenAI(itemName, currentMealName, previousItemName, originalUnit) {
    const startTime = Date.now();
    const modelName = 'gpt-4o';
    
    const systemPrompt = 'You are a nutrition expert. Provide nutrition information for food items and suggest updated meal names.';
    const userPrompt = `A user is updating a meal item. Please provide nutrition information for the new item and suggest an updated meal name.

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

Return only valid JSON, no additional text.`;

    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 1000,
      temperature: 0.1,
      response_format: { type: "json_object" }
    });
    
    const latencyMs = Date.now() - startTime;
    const responseText = completion.choices[0].message.content;
    
    // Return with audit data
    return {
      response: responseText,
      auditData: {
        provider: 'openai',
        model: modelName,
        promptSent: `[System]: ${systemPrompt}\n\n[User]: ${userPrompt}`,
        rawResponse: responseText,
        tokensUsed: {
          input: completion.usage?.prompt_tokens || null,
          output: completion.usage?.completion_tokens || null,
          total: completion.usage?.total_tokens || null
        },
        latencyMs
      }
    };
  }

  static async analyzeFoodItemWithGemini(itemName, currentMealName, previousItemName, originalUnit) {
    const startTime = Date.now();
    const modelName = 'gemini-2.5-flash';
    console.log(`🤖 [GEMINI] Using model: ${modelName} for item analysis`);
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      generationConfig: {
        temperature: 0.1
      }
    });
    
    // Build prompt based on whether this is a new item or replacement
    const isNewItem = !previousItemName || previousItemName === 'null' || previousItemName === '';
    const prompt = isNewItem 
      ? `A user is adding a new item to a meal. Please provide nutrition information for the item and suggest an updated meal name if appropriate.

Current meal name: "${currentMealName}"
New item name (that is being added): "${itemName}"
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
  "updatedMealName": "Updated meal name that includes the new item (if the meal name should change), otherwise keep the same meal name"
}

Guidelines:
1. Provide realistic nutrition values for a typical serving of ${itemName} using the unit "${originalUnit}"
2. For the updatedMealName, consider how adding "${itemName}" to "${currentMealName}" would change the overall meal description
3. Keep the meal name concise but descriptive
4. If adding the item doesn't significantly change the meal, you can keep the same meal name
5. ALWAYS use the original unit "${originalUnit}" in the quantity field

Examples:
- Adding "Brown Rice" to "Chicken Bowl" → "Chicken and Brown Rice Bowl"
- Adding "Banana" to "Fruit Salad" → "Fruit Salad with Banana"
- Adding "Salad" to "Grilled Chicken" → "Grilled Chicken Salad"

Return only valid JSON, no additional text.`
      : `A user is updating a meal item. Please provide nutrition information for the new item and suggest an updated meal name.

Current meal name: "${currentMealName}"
Previous item name (that is being replaced): "${previousItemName}"
New item name (that is being added): "${itemName}"
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
  "updatedMealName": "Updated meal name reflecting the change, remove the previous item name and add the new item name appropriately (if needed)"
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

Return only valid JSON, no additional text.`;

    try {
      console.log(`🤖 [GEMINI] Sending item analysis request`);
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ]
      });
      
      const latencyMs = Date.now() - startTime;
      const responseText = result.response.text();
      console.log(`🤖 [GEMINI] Item analysis response received, length: ${responseText?.length || 0}`);
      
      if (!responseText || responseText.trim() === '') {
        console.error('❌ [GEMINI] Empty response received for item analysis');
        throw new Error('Empty response from Gemini API');
      }
      
      // Extract token usage from Gemini response
      const usageMetadata = result.response.usageMetadata;
      
      // Return with audit data
      return {
        response: responseText,
        auditData: {
          provider: 'gemini',
          model: modelName,
          promptSent: prompt,
          rawResponse: responseText,
          tokensUsed: {
            input: usageMetadata?.promptTokenCount || null,
            output: usageMetadata?.candidatesTokenCount || null,
            total: usageMetadata?.totalTokenCount || null
          },
          latencyMs
        }
      };
    } catch (error) {
      console.error('❌ [GEMINI] API Error for item analysis:', error.message);
      console.error('❌ [GEMINI] Full error:', error);
      throw error;
    }
  }

  static async analyzeFoodItem(itemName, currentMealName, previousItemName, originalUnit, provider = 'gemini') {
    try {
      let result;
      
      if (provider === 'gemini') {
        result = await this.analyzeFoodItemWithGemini(itemName, currentMealName, previousItemName, originalUnit);
      } else {
        result = await this.analyzeFoodItemWithOpenAI(itemName, currentMealName, previousItemName, originalUnit);
      }
      
      // Return both the response text and audit data
      return {
        response: result.response,
        auditData: result.auditData
      };
    } catch (error) {
      throw new Error(`Failed to analyze food item: ${error.message}`);
    }
  }

  static async analyzeFoodCalories(imageUrl, hint, provider = 'gemini', userId = null, additionalData = {}) {
    try {
      let result;
      let llmModel;
      
      if (provider === 'openai') {
        result = await this.analyzeFoodWithGemini(imageUrl, hint);
        llmModel = 'gpt-4o';
      } else {
        result = await this.analyzeFoodWithOpenAI(imageUrl, hint);
        llmModel = 'gemini-2.5-flash';
      }
      
      // Save meal data to database if userId is provided
      let savedMeal = null;
      console.log('userId', userId);
      if (userId) {
        // Use imageUrl if available, otherwise use hint as a reference
        const imageReference = imageUrl || (hint ? `text: ${hint}` : null);
        savedMeal = await this.saveMealData(userId, imageReference, result, provider, llmModel, additionalData);
      }
      
      return { 
        calories: result, 
        provider,
        mealId: savedMeal ? savedMeal._id : null
      };
    } catch (error) {
      throw new Error(`Failed to analyze food: ${error.message}`);
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
      
      // Handle photos array - only include if imageUrl is a valid URL
      const photos = [];
      if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
        photos.push({
          url: imageUrl,
          width: additionalData.width || null,
          height: additionalData.height || null
        });
      }

      const dateUtils = require('../utils/dateUtils');
      const mealData = {
        userId,
        capturedAt: additionalData.capturedAt ? new Date(additionalData.capturedAt) : dateUtils.getCurrentDateInIST(),
        photos: photos,
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
      // Clean markdown code blocks if present
      let cleanResult = aiResult;
      if (aiResult.includes('```json')) {
        cleanResult = aiResult.split('```json')[1].split('```')[0].trim();
      } else if (aiResult.includes('```')) {
        cleanResult = aiResult.split('```')[1].split('```')[0].trim();
      }
      
      console.log('🤖 [AI] Cleaned AI result for parsing:', cleanResult.substring(0, 100) + '...');
      
      // Try to parse as JSON first
      const parsed = JSON.parse(cleanResult);
      
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
        calories: parseFloat(((total.calories || 0) + (item.nutrition.calories || 0)).toFixed(2)),
        protein: parseFloat(((total.protein || 0) + (item.nutrition.protein || 0)).toFixed(2)),
        carbs: parseFloat(((total.carbs || 0) + (item.nutrition.carbs || 0)).toFixed(2)),
        fat: parseFloat(((total.fat || 0) + (item.nutrition.fat || 0)).toFixed(2))
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  }

  static extractCaloriesFromAIResult(aiResult) {
    // Simple regex to extract calories from AI response
    // This can be enhanced based on your specific AI response format
    const calorieMatch = aiResult.match(/(\d+(?:\.\d+)?)\s*calories?/i);
    return calorieMatch ? parseFloat(calorieMatch[1]) : null;
  }

  static async batchUpdateFoodItems(items, currentMealName, shouldUpdateMealName, mainItemInfo) {
    const startTime = Date.now();
    const modelName = 'gemini-2.5-flash';
    console.log(`🤖 [GEMINI] Using model: ${modelName} for batch item update`);
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      generationConfig: {
        temperature: 0.1
      }
    });

    const itemDescriptions = items.map((item, index) => 
      `${index + 1}. ${item.originalName} → ${item.newName} | ${item.newQuantity} ${item.unit} | Main: ${item.isMainItem ? 'Yes' : 'No'}`
    ).join('\n');

    const mealNameInstruction = shouldUpdateMealName
      ? `Update meal name (main changed: ${mainItemInfo.originalName} → ${mainItemInfo.newName})`
      : `Keep meal name: "${currentMealName}"`;

    const prompt = `You are a world-class nutritionist and an expert in identifying food items, especially from diverse cuisines like Indian meals.

Meal: "${currentMealName}"

Updated items:
${itemDescriptions}

Action: ${mealNameInstruction}

Return JSON with this structure:
{
  "items": [
    {
      "name": "item name",
      "quantity": {"value": 1, "unit": "unit"},
      "nutrition": {"calories": 150, "protein": 10, "carbs": 20, "fat": 5}
    }
  ],
  "mealName": "updated or unchanged meal name",
  "mealNameChanged": true/false
}

Guidelines:
• Provide nutrition for EXACT quantity specified
• Main items: proteins/primary carbs (paneer, chicken, rice, roti)
• Minor items: sides/condiments (raita, salad, chutney)
• Keep meal names concise (max 4-5 words)
• If main item changed: update meal name
• If only minor items changed: keep original name

Return only valid JSON, no additional text.`;

    try {
      console.log(`🤖 [GEMINI] Sending batch update request`);
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ]
      });
      
      const latencyMs = Date.now() - startTime;
      const responseText = result.response.text();
      console.log(`🤖 [GEMINI] Batch update response received, length: ${responseText?.length || 0}`);
      
      if (!responseText || responseText.trim() === '') {
        console.error('❌ [GEMINI] Empty response received for batch update');
        throw new Error('Empty response from Gemini API');
      }

      // Clean markdown code blocks if present
      let cleanResponse = responseText;
      const hadMarkdown = responseText.includes('```json') || responseText.includes('```');
      if (responseText.includes('```json')) {
        console.log('📝 [GEMINI] Detected markdown code block (```json), cleaning...');
        cleanResponse = responseText.split('```json')[1].split('```')[0].trim();
        console.log(`📝 [GEMINI] Cleaned response length: ${cleanResponse.length}, original: ${responseText.length}`);
      } else if (responseText.includes('```')) {
        console.log('📝 [GEMINI] Detected markdown code block (```), cleaning...');
        cleanResponse = responseText.split('```')[1].split('```')[0].trim();
        console.log(`📝 [GEMINI] Cleaned response length: ${cleanResponse.length}, original: ${responseText.length}`);
      } else {
        console.log('📝 [GEMINI] No markdown code blocks detected, using response as-is');
      }

      // Log first 200 chars of cleaned response for debugging
      console.log(`📝 [GEMINI] Cleaned response preview: ${cleanResponse.substring(0, 200)}${cleanResponse.length > 200 ? '...' : ''}`);

      // Parse JSON response
      let parsedResult;
      try {
        parsedResult = JSON.parse(cleanResponse);
        console.log('✅ [GEMINI] Successfully parsed JSON response:', {
          itemsCount: parsedResult?.items?.length || 0,
          mealName: parsedResult?.mealName,
          mealNameChanged: parsedResult?.mealNameChanged
        });
      } catch (parseError) {
        console.error('❌ [GEMINI] JSON parse error:', {
          error: parseError.message,
          hadMarkdown,
          responseLength: cleanResponse.length,
          responsePreview: cleanResponse.substring(0, 500)
        });
        throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
      }
      
      // Extract token usage from Gemini response
      const usageMetadata = result.response.usageMetadata;

      return {
        ...parsedResult,
        auditData: {
          provider: 'gemini',
          model: modelName,
          promptSent: prompt,
          rawResponse: responseText,
          parsedResponse: parsedResult,
          tokensUsed: {
            input: usageMetadata?.promptTokenCount || null,
            output: usageMetadata?.candidatesTokenCount || null,
            total: usageMetadata?.totalTokenCount || null
          },
          latencyMs
        }
      };
    } catch (error) {
      console.error('❌ [GEMINI] API Error for batch update:', error.message);
      console.error('❌ [GEMINI] Full error:', error);
      throw error;
    }
  }
}

module.exports = AiService; 