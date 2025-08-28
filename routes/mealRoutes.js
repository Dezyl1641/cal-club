const mealController = require('../controllers/mealController');

const routes = {
  'POST /meals': mealController.createMeal,
  'GET /meals': mealController.getMeals,
  'GET /meals/:id': mealController.getMealById,
  'PATCH /meals/:id': mealController.updateMeal,
  'DELETE /meals/:id': mealController.deleteMeal,
  'GET /meals/summary/daily': mealController.getDailySummary,
  'GET /meals/calendar': mealController.getCalendarData
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
    // Check for /meals/:id pattern
    if (basePath.match(/^\/meals\/[^\/]+$/)) {
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