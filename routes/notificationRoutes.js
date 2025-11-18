const notificationController = require('../controllers/notificationController');

const routes = {
  'POST /notifications/register-token': notificationController.registerToken,
  'POST /notifications/deregister-token': notificationController.deregisterToken,
  'POST /notifications/send': notificationController.sendNotification
};

function notificationRoutes(req, res) {
  // Extract base path without query parameters
  const basePath = req.url.split('?')[0];
  const routeKey = `${req.method} ${basePath}`;
  const handler = routes[routeKey];

  if (handler) {
    handler(req, res);
    return true;
  }

  // 404 for notification routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Notification route not found' }));
  return true;
}

module.exports = notificationRoutes;

