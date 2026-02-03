const AuthService = require('../services/authService');
const parseBody = require('../utils/parseBody');
const { reportError } = require('../utils/sentryReporter');

function requestOtp(req, res) {
  parseBody(req, async (err, data) => {
    if (err || !data.phone) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request. Phone number required.' }));
      return;
    }

    try {
      // Extract provider from request body (default: fast2sms-otp)
      // Supported providers: 'twilio', 'fast2sms-otp', 'fast2sms-quicksms', 'fast2sms-dlt'
      const provider = data.provider || 'fast2sms-otp';
      
      const result = await AuthService.requestOtp(data.phone, provider);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      reportError(error, { req });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to send OTP via SMS', details: error.message }));
    }
  });
}

function verifyOtp(req, res) {
  parseBody(req, async (err, data) => {
    if (err || !data.phone || !data.otp) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request. Phone and OTP required.' }));
      return;
    }

    try {
      const result = await AuthService.verifyOtp(data.phone, data.otp);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      if (error.message === 'Invalid OTP') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid OTP.' }));
      } else {
        reportError(error, { req });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Database error', details: error.message }));
      }
    }
  });
}

function verifyFirebaseToken(req, res) {
  parseBody(req, async (err, data) => {
    if (err || !data.idToken) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request. Firebase ID token required.' }));
      return;
    }

    try {
      const result = await AuthService.verifyFirebaseToken(data.idToken);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      // Handle Firebase-specific errors
      if (error.message.includes('expired') || error.message.includes('revoked') || error.message.includes('Invalid Firebase token')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      } else {
        reportError(error, { req });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to verify Firebase token', details: error.message }));
      }
    }
  });
}

module.exports = { requestOtp, verifyOtp, verifyFirebaseToken }; 