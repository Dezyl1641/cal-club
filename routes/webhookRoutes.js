const webhookController = require('../controllers/webhookController');
const googlePlayWebhookController = require('../controllers/googlePlayWebhookController');
const appleWebhookController = require('../controllers/appleWebhookController');

const routes = {
  // Razorpay webhooks
  'POST /webhooks/razorpay': webhookController.handleRazorpayWebhook,
  'GET /webhooks/events': webhookController.getPaymentEvents,
  
  // Google Play RTDN (Real-Time Developer Notifications)
  'POST /webhooks/google-play': googlePlayWebhookController.handleGooglePlayWebhook,
  
  // Apple App Store Server Notifications V2
  'POST /webhooks/apple': appleWebhookController.handleAppleWebhook
};

function webhookRoutes(req, res) {
  // Extract base path without query parameters
  const basePath = req.url.split('?')[0];
  const routeKey = `${req.method} ${basePath}`;
  const handler = routes[routeKey];

  if (handler) {
    handler(req, res);
    return true;
  }

  // 404 for webhook routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Webhook route not found' }));
  return true;
}

module.exports = webhookRoutes;
