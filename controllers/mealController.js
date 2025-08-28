const MealService = require('../services/mealService');
const parseBody = require('../utils/parseBody');

function createMeal(req, res) {
  parseBody(req, async (err, mealData) => {
    if (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }

    try {
      const meal = await MealService.createMeal(req.user.userId, mealData);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(meal));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to create meal', details: error.message }));
    }
  });
}

async function getMeals(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const query = {
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    date: url.searchParams.get('date'),
    limit: url.searchParams.get('limit'),
    skip: url.searchParams.get('skip')
  };

  try {
    const meals = await MealService.getMeals(req.user.userId, query);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(meals));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch meals', details: error.message }));
  }
}

async function getMealById(req, res) {
  const mealId = req.url.split('/')[2]; // Extract ID from /meals/:id

  try {
    const meal = await MealService.getMealById(req.user.userId, mealId);
    if (!meal) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Meal not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(meal));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch meal', details: error.message }));
  }
}

function updateMeal(req, res) {
  const mealId = req.url.split('/')[2]; // Extract ID from /meals/:id

  parseBody(req, async (err, updateData) => {
    if (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }

    try {
      const meal = await MealService.updateMeal(req.user.userId, mealId, updateData);
      if (!meal) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Meal not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(meal));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update meal', details: error.message }));
    }
  });
}

async function deleteMeal(req, res) {
  const mealId = req.url.split('/')[2]; // Extract ID from /meals/:id

  try {
    const result = await MealService.deleteMeal(req.user.userId, mealId);
    if (!result) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Meal not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Meal deleted successfully' }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to delete meal', details: error.message }));
  }
}

async function getDailySummary(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');

  if (!start || !end) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'start and end dates are required' }));
    return;
  }

  try {
    const summary = await MealService.getDailySummary(req.user.userId, start, end);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(summary));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch daily summary', details: error.message }));
  }
}

async function getCalendarData(req, res) {
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
    const calendarData = await MealService.getCalendarData(req.user.userId, date);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(calendarData));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch calendar data', details: error.message }));
  }
}

module.exports = {
  createMeal,
  getMeals,
  getMealById,
  updateMeal,
  deleteMeal,
  getDailySummary,
  getCalendarData
}; 