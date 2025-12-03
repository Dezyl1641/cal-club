const AiService = require('../services/aiService');
const parseBody = require('../utils/parseBody');
const mealFormatter = require('../utils/mealFormatter');

function foodCalories(req, res) {
  parseBody(req, async (err, data) => {
    if (err || (!data.url && !data.hint)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Either image URL or hint (text description) is required in body as { "url": "..." } or { "hint": "..." } or both' }));
      return;
    }

    const provider = data.provider || 'openai';
    const additionalData = {
      capturedAt: data.capturedAt ? new Date(data.capturedAt) : new Date(),
      width: data.width || null,
      height: data.height || null,
      notes: data.notes || ''
    };

    try {
      const result = await AiService.analyzeFoodCalories(data.url || null, data.hint || null, provider, req.user.userId, additionalData);
      
      // If a meal was saved, format it according to the new response format
      if (result.mealId) {
        const Meal = require('../models/schemas/Meal');
        const meal = await Meal.findById(result.mealId);
        if (meal) {
          const formattedResponse = mealFormatter.formatMealResponse(meal);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(formattedResponse));
          return;
        }
      }
      
      // Fallback to original response if no meal was saved
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to analyze image', details: error.message }));
    }
  });
}

module.exports = { foodCalories }; 