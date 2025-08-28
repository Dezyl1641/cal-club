const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

async function connectToMongo() {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
      console.log('Connected to MongoDB with Mongoose!');
      
      // Load all schemas
      require('../models/schemas/User');
      require('../models/schemas/UserOtp');
      require('../models/schemas/UserAuthToken');
      require('../models/schemas/Meal');
    }
    return mongoose.connection;
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }
}

module.exports = { connectToMongo }; 