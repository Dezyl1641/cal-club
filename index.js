require('dotenv').config();
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENV || 'prod',
  tracesSampleRate: 0,
});

const http = require('http');
const jwtMiddleware = require('./middleware/auth');
const setupRoutes = require('./routes/index');
const { connectToMongo } = require('./config/db');
const { initializeMealReminderCron, getCurrentTimeIST } = require('./services/scheduledNotificationService');

const PORT = process.env.PORT || 3000;
const { reportError } = require('./utils/sentryReporter');

process.on('unhandledRejection', (reason, promise) => {
  reportError(reason instanceof Error ? reason : new Error(String(reason)));
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  reportError(err);
  console.error('Uncaught Exception:', err);
});

const server = http.createServer(async (req, res) => {
  try {
    jwtMiddleware(req, res, () => {
      try {
        setupRoutes(req, res);
      } catch (err) {
        reportError(err, { req });
        console.error('Route error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error', details: err.message }));
        }
      }
    });
  } catch (err) {
    reportError(err, { req });
    console.error('Request error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', details: err.message }));
    }
  }
});

connectToMongo().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`Current IST time: ${getCurrentTimeIST()}`);
    
    // Initialize meal reminder cron job
    initializeMealReminderCron();
  });
}); 