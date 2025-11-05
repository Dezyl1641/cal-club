const UserLog = require('../models/schemas/UserLog');
const parseBody = require('../utils/parseBody');

/**
 * Create a new user log entry
 * POST /user-logs
 */
async function createUserLog(req, res) {
  try {
    // Extract userId from auth token
    if (!req.user || !req.user.userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Authentication required. Please provide a valid JWT token.'
      }));
      return;
    }

    const userId = req.user.userId;

    // Parse request body
    const body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    // Validate required fields
    const { type, value, unit, date } = body;

    if (!type || !value || !unit) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Missing required fields: type, value, and unit are required'
      }));
      return;
    }

    // Validate type enum
    if (type !== 'WEIGHT') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Invalid type. Allowed values: WEIGHT`
      }));
      return;
    }

    // Validate value (value is stored as string, but we validate it's numeric)
    const numericValue = parseFloat(value);
    if (isNaN(numericValue) || numericValue < 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'value must be a positive number'
      }));
      return;
    }

    // Get date in IST timezone (UTC+5:30)
    // If date is provided, validate it; otherwise use today's date in IST
    let logDate;
    if (date) {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'date must be in YYYY-MM-DD format'
        }));
        return;
      }
      logDate = date; // Store as string directly
    } else {
      // Get current date in IST timezone (UTC+5:30)
      // Use Intl.DateTimeFormat to reliably get IST date components
      const now = new Date();
      const istFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      
      // This returns YYYY-MM-DD format directly
      logDate = istFormatter.format(now);
    }

    // Check if log already exists for this user, type, and date
    const existingLog = await UserLog.findOne({
      userId,
      type,
      date: logDate
    });

    if (existingLog) {
      // Update existing log
      existingLog.value = value; // Store as string (as per schema)
      existingLog.unit = unit.trim();
      await existingLog.save();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Log updated successfully',
        data: {
          _id: existingLog._id,
          userId: existingLog.userId,
          type: existingLog.type,
          value: existingLog.value,
          unit: existingLog.unit,
          date: existingLog.date, // Already in YYYY-MM-DD format (string)
          createdAt: existingLog.createdAt,
          updatedAt: existingLog.updatedAt
        }
      }));
      return;
    }

    // Create new log
    const userLog = new UserLog({
      userId,
      type,
      value: value, // Store as string (as per schema)
      unit: unit.trim(),
      date: logDate // String in YYYY-MM-DD format
    });

    await userLog.save();

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Log created successfully',
      data: {
        _id: userLog._id,
        userId: userLog.userId,
        type: userLog.type,
        value: userLog.value,
        unit: userLog.unit,
        date: userLog.date, // Already in YYYY-MM-DD format (string)
        createdAt: userLog.createdAt,
        updatedAt: userLog.updatedAt
      }
    }));

  } catch (error) {
    console.error('Error creating user log:', error);
    
    // Handle duplicate key error (unique index violation)
    if (error.code === 11000) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'A log already exists for this user, type, and date'
      }));
      return;
    }

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Failed to create user log',
      details: error.message
    }));
  }
}

module.exports = {
  createUserLog
};

