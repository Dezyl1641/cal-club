const AiService = require('../services/aiService');
const parseBody = require('../utils/parseBody');

function foodCalories(req, res) {
  parseBody(req, async (err, data) => {
    if (err || !data.url) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Image URL required in body as { "url": "..." }' }));
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
      const result = await AiService.analyzeFoodCalories(data.url, provider, req.user.userId, additionalData);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to analyze image', details: error.message }));
    }
  });
}

module.exports = { foodCalories }; 