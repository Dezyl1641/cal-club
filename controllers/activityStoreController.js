const ActivityStoreService = require('../services/activityStoreService');
const parseBody = require('../utils/parseBody');
const { reportError } = require('../utils/sentryReporter');

/** POST /activity-store/sync. Body: { category, source, date?, data[] } */
function sync(req, res) {
  if (!req.user?.userId) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Authentication required' }));
    return;
  }

  parseBody(req, async (err, body) => {
    if (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }

    const { category, source, date, data } = body;
    if (!category || typeof category !== 'string' || !String(category).trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'category is required' }));
      return;
    }
    if (!source) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'source is required' }));
      return;
    }
    if (!Array.isArray(data)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'data must be an array' }));
      return;
    }

    try {
      const result = await ActivityStoreService.sync(req.user.userId, category, source, date, data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (e) {
      reportError(e, { req });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message || 'Sync failed' }));
    }
  });
}

/** GET /activity-store?date=YYYY-MM-DD&category=&source= */
async function fetch(req, res) {
  if (!req.user?.userId) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Authentication required' }));
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const date = url.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Query param date is required (YYYY-MM-DD)' }));
    return;
  }

  const category = url.searchParams.get('category') || undefined;
  const source  = url.searchParams.get('source') || undefined;

  try {
    const docs = await ActivityStoreService.fetch(req.user.userId, date, { category, source });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, date, data: docs }));
  } catch (e) {
    reportError(e, { req });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message || 'Fetch failed' }));
  }
}

/** GET /activity-store/range?from=YYYY-MM-DD&to=YYYY-MM-DD&category=&source= */
async function fetchRange(req, res) {
  if (!req.user?.userId) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Authentication required' }));
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const from = url.searchParams.get('from');
  const to   = url.searchParams.get('to');
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!from || !to || !dateRegex.test(from) || !dateRegex.test(to)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Query params from and to are required (YYYY-MM-DD)' }));
    return;
  }

  const category = url.searchParams.get('category') || undefined;
  const source  = url.searchParams.get('source') || undefined;

  try {
    const docs = await ActivityStoreService.fetchRange(req.user.userId, from, to, { category, source });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, from, to, data: docs }));
  } catch (e) {
    reportError(e, { req });
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message || 'Fetch failed' }));
  }
}

module.exports = { sync, fetch, fetchRange };
