const mealController = require('../controllers/mealController');

const routes = {
  'POST /meals': mealController.createMeal,
  'GET /meals': mealController.getMeals,
  'GET /meals/:id': mealController.getMealById,
  'PATCH /meals/:id': mealController.updateMeal,
  'DELETE /meals/:id': mealController.deleteMeal,
  'POST /meals/update': mealController.updateMeal,
  'POST /meals/bulk-edit': mealController.bulkEditItems,
  'GET /meals/summary/daily': mealController.getDailySummary,
  'GET /meals/calendar': mealController.getCalendarData,
  'GET /meals/suggestions': mealController.getMealSuggestions,
  // Audit routes
  'GET /meals/audit/summary': mealController.getUserAuditSummary
};

function mealRoutes(req, res) {
  const url = req.url;
  const method = req.method;

  // Extract base path without query parameters
  const basePath = url.split('?')[0];
  
  // Handle dynamic routes with parameters
  let routeKey = `${method} ${basePath}`;
  console.log('Route key:', routeKey);
  let handler = routes[routeKey];

  // If exact match not found, try to match parameterized routes
  if (!handler) {
    // Check for /meals/:mealId/clone pattern (clone/duplicate a meal)
    if (method === 'POST' && basePath.match(/^\/meals\/[^\/]+\/clone$/)) {
      handler = mealController.cloneMeal;
    }
    // Check for /meals/:mealId/items pattern (add item to meal)
    else if (method === 'POST' && basePath.match(/^\/meals\/[^\/]+\/items$/)) {
      handler = mealController.addItemToMeal;
    }
    // Check for /meals/:mealId/items/:itemId pattern (delete item from meal)
    else if (method === 'DELETE' && basePath.match(/^\/meals\/[^\/]+\/items\/[^\/]+$/)) {
      handler = mealController.deleteItemFromMeal;
    }
    // Check for /meals/:mealId/audit pattern (audit history for a meal)
    else if (method === 'GET' && basePath.match(/^\/meals\/[^\/]+\/audit$/)) {
      handler = mealController.getMealAuditHistory;
    }
    // Check for /meals/audit/:auditId pattern (specific audit entry)
    else if (method === 'GET' && basePath.match(/^\/meals\/audit\/[^\/]+$/) && !basePath.includes('summary')) {
      handler = mealController.getAuditEntry;
    }
    // Check for /meals/:id pattern
    else if (basePath.match(/^\/meals\/[^\/]+$/)) {
      routeKey = `${method} /meals/:id`;
      handler = routes[routeKey];
    }
  }

  if (handler) {
    handler(req, res);
    return true;
  }

  // 404 for meal routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Meal route not found' }));
  return true;
}

module.exports = mealRoutes; 