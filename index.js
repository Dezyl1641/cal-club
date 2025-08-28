require('dotenv').config();
const http = require('http');
const jwtMiddleware = require('./middleware/auth');
const setupRoutes = require('./routes/index');
const { connectToMongo } = require('./config/db');

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  jwtMiddleware(req, res, () => {
    setupRoutes(req, res);
  });
});

connectToMongo().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
  });
}); 