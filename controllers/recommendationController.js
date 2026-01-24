const RecommendationService = require('../services/recommendationService');
const Recommendation = require('../models/schemas/Recommendation');
const parseBody = require('../utils/parseBody');

/**
 * Create a new recommendation template (Admin only)
 * POST /recommendations
 */
async function createRecommendationTemplate(req, res) {
  try {
    // Parse request body
    const body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    // Validate required fields
    const { dailyCreationTime, activeMinutes, type, recommendationPrompt } = body;

    if (!dailyCreationTime || !type || !recommendationPrompt) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Missing required fields: dailyCreationTime, type, and recommendationPrompt are required'
      }));
      return;
    }

    // Validate time format (HH:MM)
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(dailyCreationTime)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'dailyCreationTime must be in HH:MM format (IST), e.g., "14:30"'
      }));
      return;
    }

    // Validate type is not empty
    if (!type.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'type cannot be empty'
      }));
      return;
    }

    // Validate activeMinutes
    const minutes = parseInt(activeMinutes) || 120;
    if (minutes < 1 || minutes > 1440) { // Max 24 hours
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'activeMinutes must be between 1 and 1440'
      }));
      return;
    }

    // Create recommendation
    const recommendation = await RecommendationService.createRecommendationTemplate({
      dailyCreationTime,
      activeMinutes: minutes,
      type,
      recommendationPrompt,
      isActive: body.isActive !== false
    });

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Recommendation template created successfully',
      data: {
        _id: recommendation._id,
        dailyCreationTime: recommendation.dailyCreationTime,
        activeMinutes: recommendation.activeMinutes,
        type: recommendation.type,
        recommendationPrompt: recommendation.recommendationPrompt,
        isActive: recommendation.isActive,
        createdAt: recommendation.createdAt
      }
    }));
  } catch (error) {
    console.error('Error creating recommendation template:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Failed to create recommendation template',
      details: error.message
    }));
  }
}

/**
 * Get all recommendation templates
 * GET /recommendations
 */
async function getRecommendationTemplates(req, res) {
  try {
    const recommendations = await Recommendation.find().sort({ dailyCreationTime: 1 }).lean();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: recommendations.length,
      data: recommendations
    }));
  } catch (error) {
    console.error('Error fetching recommendation templates:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Failed to fetch recommendation templates',
      details: error.message
    }));
  }
}

/**
 * Update a recommendation template
 * PUT /recommendations/:id
 */
async function updateRecommendationTemplate(req, res) {
  try {
    const { id } = req.params;
    
    // Parse request body
    const body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    // Validate time format if provided
    if (body.dailyCreationTime) {
      const timeRegex = /^\d{2}:\d{2}$/;
      if (!timeRegex.test(body.dailyCreationTime)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'dailyCreationTime must be in HH:MM format (IST), e.g., "14:30"'
        }));
        return;
      }
    }

    // Validate type if provided
    if (body.type && !body.type.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'type cannot be empty'
      }));
      return;
    }

    // Update recommendation
    const recommendation = await Recommendation.findByIdAndUpdate(
      id,
      body,
      { new: true, runValidators: true }
    );

    if (!recommendation) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Recommendation template not found'
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Recommendation template updated successfully',
      data: recommendation
    }));
  } catch (error) {
    console.error('Error updating recommendation template:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Failed to update recommendation template',
      details: error.message
    }));
  }
}

/**
 * Manually trigger recommendation processing (for testing)
 * POST /recommendations/trigger
 */
async function triggerRecommendationProcessing(req, res) {
  try {
    console.log('🧪 [TEST] Manually triggering recommendation processing');
    
    await RecommendationService.processRecommendations();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Recommendation processing triggered successfully'
    }));
  } catch (error) {
    console.error('Error triggering recommendation processing:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Failed to trigger recommendation processing',
      details: error.message
    }));
  }
}

module.exports = {
  createRecommendationTemplate,
  getRecommendationTemplates,
  updateRecommendationTemplate,
  triggerRecommendationProcessing
};
