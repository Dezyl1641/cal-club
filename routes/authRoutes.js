const authController = require('../controllers/authController');

const routes = {
  'POST /auth/request-otp': authController.requestOtp,
  'POST /auth/verify-otp': authController.verifyOtp
};

function authRoutes(req, res) {
  // Extract base path without query parameters
  const basePath = req.url.split('?')[0];
  const routeKey = `${req.method} ${basePath}`;
  const handler = routes[routeKey];

  if (handler) {
    handler(req, res);
    return true;
  }

  // 404 for auth routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Auth route not found' }));
  return true;
}

module.exports = authRoutes; 