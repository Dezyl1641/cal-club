const subscriptionController = require('../controllers/subscriptionController');

const routes = {
  // Unified subscription status (RevenueCat + local fallback)
  'GET /subscriptions/status': subscriptionController.getSubscriptionStatus,

  // Razorpay subscription routes
  'POST /subscriptions': subscriptionController.createSubscription,
  'GET /subscriptions': subscriptionController.getSubscription,
  'GET /plans': subscriptionController.getActivePlans,
  'POST /memberships/cancel': subscriptionController.cancelMembership,
  
  // Google Play subscription routes
  'POST /subscriptions/google-play/verify': subscriptionController.verifyGooglePlayPurchase,
  'POST /subscriptions/google-play/status': subscriptionController.getGooglePlaySubscriptionStatus,
  
  // Apple App Store subscription routes
  'POST /subscriptions/apple/verify': subscriptionController.verifyApplePurchase,
  'POST /subscriptions/apple/status': subscriptionController.getAppleSubscriptionStatus,
  'POST /subscriptions/apple/restore': subscriptionController.restoreApplePurchases
};

function subscriptionRoutes(req, res) {
  // Extract base path without query parameters
  const basePath = req.url.split('?')[0];
  const routeKey = `${req.method} ${basePath}`;
  
  // Check for exact matches first (including Google Play routes)
  const handler = routes[routeKey];
  if (handler) {
    handler(req, res);
    return true;
  }

  // Check for dynamic routes (like /subscriptions/:id)
  // But not for google-play or apple routes which should be handled above
  if (req.method === 'GET' && basePath.startsWith('/subscriptions/') && !basePath.includes('google-play') && !basePath.includes('apple')) {
    subscriptionController.getSubscriptionById(req, res);
    return true;
  }

  // 404 for subscription routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Subscription route not found' }));
  return true;
}

module.exports = subscriptionRoutes;
