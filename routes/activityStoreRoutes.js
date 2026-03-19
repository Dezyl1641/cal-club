const activityStoreController = require('../controllers/activityStoreController');

const routes = {
  'POST /activity-store/sync': activityStoreController.sync,
  'GET /activity-store': activityStoreController.fetch,
  'GET /activity-store/range': activityStoreController.fetchRange
};

function activityStoreRoutes(req, res) {
  const basePath = req.url.split('?')[0];
  const routeKey = `${req.method} ${basePath}`;
  const handler = routes[routeKey];

  if (handler) {
    handler(req, res);
    return true;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Activity store route not found' }));
  return true;
}

module.exports = activityStoreRoutes;
