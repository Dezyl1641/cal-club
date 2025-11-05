const userLogController = require('../controllers/userLogController');

const routes = {
  'POST /user-logs': userLogController.createUserLog
};

function userLogRoutes(req, res) {
  // Extract base path without query parameters
  const basePath = req.url.split('?')[0];
  const routeKey = `${req.method} ${basePath}`;
  const handler = routes[routeKey];

  if (handler) {
    handler(req, res);
    return true;
  }

  // 404 for user log routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'User log route not found' }));
  return true;
}

module.exports = userLogRoutes;

