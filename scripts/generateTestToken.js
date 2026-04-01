const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * Generate a test JWT token for testing V4 endpoint
 */

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('JWT_SECRET not found in .env file');
  process.exit(1);
}

// Create a test user payload
const testUser = {
  userId: 'test_user_123',
  phone: '+1234567890',
  email: 'test@example.com'
};

// Generate token (valid for 30 days)
const token = jwt.sign(testUser, JWT_SECRET, { expiresIn: '30d' });

console.log('✓ Test JWT Token Generated:\n');
console.log(token);
console.log('\nThis token is valid for 30 days.');
console.log('\nYou can now test V4 with:');
console.log(`node scripts/testV4.js "IMAGE_URL" "${token}" "optional hint"`);
