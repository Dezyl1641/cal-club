const AppFormatService = require('../services/appFormatService');

async function getAppCalendar(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const date = url.searchParams.get('date');

  if (!date) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'date parameter is required (YYYY-MM-DD format)' }));
    return;
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'date must be in YYYY-MM-DD format' }));
    return;
  }

  try {
    const appCalendarData = await AppFormatService.getAppCalendarData(req.user.userId, date);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(appCalendarData));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch app calendar data', details: error.message }));
  }
}

async function getProgress(req, res) {
  try {
    // Validate authentication
    if (!req.user || !req.user.userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false,
        error: 'Authentication required. Please provide a valid JWT token.' 
      }));
      return;
    }

    const progressData = await AppFormatService.getProgressData(req.user.userId);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Progress data fetched successfully',
      data: progressData
    }));
  } catch (error) {
    console.error('Error fetching progress data:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: false,
      error: 'Failed to fetch progress data', 
      details: error.message 
    }));
  }
}

module.exports = { 
  getAppCalendar,
  getProgress
}; 