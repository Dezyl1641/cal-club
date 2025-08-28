function testRoute(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Test route working!', userId: req.user.userId }));
}

module.exports = { testRoute }; 