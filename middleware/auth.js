const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

function jwtMiddleware(req, res, next) {
  if (
    (req.url === '/auth/request-otp' || req.url === '/auth/verify-otp') &&
    req.method === 'POST'
  ) {
    return next();
  }
  
  // Allow public access to onboarding questions
  if (req.url === '/onboarding/questions' && req.method === 'GET') {
    return next();
  }
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing or invalid Authorization header' }));
    return;
  }
  const token = authHeader.split(' ')[1];
           try {
           const decoded = jwt.verify(token, JWT_SECRET);
           req.user = decoded; // Contains userId
           next();
         } catch (err) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or expired token' }));
  }
}

module.exports = jwtMiddleware; 