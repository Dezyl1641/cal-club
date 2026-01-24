const recommendationController = require('../controllers/recommendationController');

const routes = {
  'POST /recommendations': recommendationController.createRecommendationTemplate,
  'GET /recommendations': recommendationController.getRecommendationTemplates,
  'PUT /recommendations/:id': recommendationController.updateRecommendationTemplate,
  'POST /recommendations/trigger': recommendationController.triggerRecommendationProcessing
};

function recommendationRoutes(req, res) {
  // Extract base path without query parameters
  const basePath = req.url.split('?')[0];
  const routeKey = `${req.method} ${basePath}`;
  
  // Check for exact match first
  if (routes[routeKey]) {
    routes[routeKey](req, res);
    return true;
  }

  // Check for parameterized routes
  const putMatch = basePath.match(/^\/recommendations\/([a-f0-9]{24})$/);
  if (req.method === 'PUT' && putMatch) {
    req.params = { id: putMatch[1] };
    routes['PUT /recommendations/:id'](req, res);
    return true;
  }

  // 404 for recommendation routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Recommendation route not found' }));
  return true;
}

module.exports = recommendationRoutes;
