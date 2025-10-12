const subscriptionController = require('../controllers/subscriptionController');

const routes = {
  'POST /subscriptions': subscriptionController.createSubscription,
  'GET /subscriptions': subscriptionController.getSubscription,
  'GET /plans': subscriptionController.getActivePlans,
  'POST /memberships/cancel': subscriptionController.cancelMembership
};

function subscriptionRoutes(req, res) {
  // Extract base path without query parameters
  const basePath = req.url.split('?')[0];
  const routeKey = `${req.method} ${basePath}`;
  
  // Check for exact matches first
  const handler = routes[routeKey];
  if (handler) {
    handler(req, res);
    return true;
  }

  // Check for dynamic routes (like /subscriptions/:id)
  if (req.method === 'GET' && basePath.startsWith('/subscriptions/')) {
    const subscriptionController = require('../controllers/subscriptionController');
    subscriptionController.getSubscriptionById(req, res);
    return true;
  }

  // 404 for subscription routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Subscription route not found' }));
  return true;
}

module.exports = subscriptionRoutes;
