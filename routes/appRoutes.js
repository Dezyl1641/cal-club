const appController = require('../controllers/appController');

const routes = {
  'GET /app/calendar': appController.getAppCalendar,
  'GET /app/progress': appController.getProgress
};

function appRoutes(req, res) {
  // Extract base path without query parameters
  const basePath = req.url.split('?')[0];
  const routeKey = `${req.method} ${basePath}`;
  const handler = routes[routeKey];

  if (handler) {
    handler(req, res);
    return true;
  }

  // 404 for app routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'App route not found' }));
  return true;
}

module.exports = appRoutes; 