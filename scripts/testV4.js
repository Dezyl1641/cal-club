const https = require('https');
const http = require('http');

/**
 * Test script for V4 nutrition API endpoint
 *
 * Usage:
 *   node scripts/testV4.js <imageUrl> <token> [hint]
 *
 * Example:
 *   node scripts/testV4.js "https://example.com/food.jpg" "your-jwt-token" "biryani"
 */

const imageUrl = process.argv[2];
const token = process.argv[3];
const hint = process.argv[4] || '';

if (!imageUrl || !token) {
  console.error('Usage: node scripts/testV4.js <imageUrl> <token> [hint]');
  console.error('\nExample:');
  console.error('  node scripts/testV4.js "https://example.com/food.jpg" "your-jwt-token" "biryani"');
  process.exit(1);
}

const requestBody = JSON.stringify({
  url: imageUrl,
  hint: hint,
  capturedAt: new Date().toISOString()
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/ai/food-calories-v4',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(requestBody),
    'Authorization': `Bearer ${token}`
  }
};

console.log('Testing V4 API endpoint...');
console.log('Image URL:', imageUrl);
console.log('Hint:', hint || '(none)');
console.log('');

const req = http.request(options, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('');

  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      console.log('Response:');
      console.log(JSON.stringify(response, null, 2));

      // Print summary
      if (response.mealData) {
        console.log('\n=== SUMMARY ===');
        console.log(`Total Calories: ${response.mealData.totalCalories}`);
        console.log(`Total Protein: ${response.mealData.totalProtein}g`);
        console.log(`Total Carbs: ${response.mealData.totalCarbs}g`);
        console.log(`Total Fat: ${response.mealData.totalFat}g`);
        console.log(`\nItems: ${response.mealData.items.length}`);

        response.mealData.items.forEach((item, idx) => {
          console.log(`\n${idx + 1}. ${item.name}`);
          console.log(`   Type: ${item.itemType || 'N/A'}`);
          console.log(`   Category: ${item.category || 'N/A'}`);
          console.log(`   Source: ${item.nutritionSource || 'N/A'}`);
          console.log(`   Calories: ${item.calories}`);

          if (item.components && item.components.length > 0) {
            console.log(`   Components:`);
            item.components.forEach(comp => {
              console.log(`     - ${comp.name}: ${comp.grams}g (${comp.calories} cal)`);
            });
          }
        });

        if (response.sourceBreakdown) {
          console.log('\n=== SOURCE BREAKDOWN ===');
          console.log(JSON.stringify(response.sourceBreakdown, null, 2));
        }
      }
    } catch (err) {
      console.error('Failed to parse response:', err);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('Request failed:', error);
});

req.write(requestBody);
req.end();
