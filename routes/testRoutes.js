const testController = require('../controllers/testController');

const routes = {
  'GET /test': testController.testRoute
};

function testRoutes(req, res) {
  // Extract base path without query parameters
  const basePath = req.url.split('?')[0];
  const routeKey = `${req.method} ${basePath}`;
  const handler = routes[routeKey];

  if (handler) {
    handler(req, res);
    return true;
  }

  // 404 for test routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Test route not found' }));
  return true;
}

module.exports = testRoutes; 