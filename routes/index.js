const authRoutes = require('./authRoutes');
const aiRoutes = require('./aiRoutes');
const testRoutes = require('./testRoutes');
const mealRoutes = require('./mealRoutes');
const userRoutes = require('./userRoutes');
const appRoutes = require('./appRoutes');
const onboardingRoutes = require('./onboardingRoutes');

function setupRoutes(req, res) {
  const url = req.url;
  const method = req.method;

  // Auth routes
  if (url.startsWith('/auth/')) {
    return authRoutes(req, res);
  }

  // AI routes
  if (url.startsWith('/ai/')) {
    return aiRoutes(req, res);
  }

  // Test routes
  if (url.startsWith('/test')) {
    return testRoutes(req, res);
  }

  // Meal routes
  if (url.startsWith('/meals')) {
    return mealRoutes(req, res);
  }

  // User routes
  if (url.startsWith('/users')) {
    return userRoutes(req, res);
  }

  // App routes
  if (url.startsWith('/app')) {
    return appRoutes(req, res);
  }

  // Onboarding routes
  if (url.startsWith('/onboarding')) {
    return onboardingRoutes(req, res);
  }

  // Default 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Route not found' }));
  return true;
}

module.exports = setupRoutes; 