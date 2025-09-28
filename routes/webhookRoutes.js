const webhookController = require('../controllers/webhookController');

const routes = {
  'POST /webhooks/razorpay': webhookController.handleRazorpayWebhook,
  'GET /webhooks/events': webhookController.getPaymentEvents
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
