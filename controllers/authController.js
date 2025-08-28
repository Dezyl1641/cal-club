const AuthService = require('../services/authService');
const parseBody = require('../utils/parseBody');

function requestOtp(req, res) {
  parseBody(req, async (err, data) => {
    if (err || !data.phone) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request. Phone number required.' }));
      return;
    }

    try {
      const result = await AuthService.requestOtp(data.phone);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
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
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Database error', details: error.message }));
      }
    }
  });
}

module.exports = { requestOtp, verifyOtp }; 