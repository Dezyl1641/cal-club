const goalService = require('../services/goalService');
const parseBody = require('../utils/parseBody');

/**
 * Calculate and validate goal targets based on user inputs
 * POST /goals/calculate
 */
async function calculateGoals(req, res) {
  try {
    const body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    console.log('Goal calculation request:', JSON.stringify(body, null, 2));

    // Validate inputs first
    const validation = goalService.validateInputs(body);
    if (!validation.valid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Invalid input parameters',
        validation: {
          valid: false,
          errors: validation.errors,
          warnings: validation.warnings
        }
      }));
      return;
    }

    // Calculate goals
    const result = goalService.computeTargets(body);

    // Add validation warnings to response if any
    if (validation.warnings.length > 0) {
      result.warnings = validation.warnings;
    }

    console.log('Goal calculation result:', JSON.stringify(result, null, 2));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: result
    }));

  } catch (error) {
    console.error('Error calculating goals:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Failed to calculate goals',
      details: error.message
    }));
  }
}

module.exports = {
  calculateGoals
};
