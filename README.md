# iCal - Food Calorie Tracking App

A Node.js application for tracking food calories using AI-powered image analysis.

## Features

- 🔐 JWT Authentication with OTP via SMS
- 🤖 AI-powered food calorie estimation (OpenAI GPT-4o & Google Gemini)
- 📱 SMS OTP using Twilio/Plivo
- 🍽️ Meal tracking and management
- 📊 Daily/weekly nutrition summaries
- 🎯 User goals and progress tracking

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here

# MongoDB Configuration
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# OpenAI Configuration
OPENAI_API_KEY=sk-your_openai_api_key_here

# Google Gemini Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# Twilio Configuration (for SMS OTP)
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890

# Plivo Configuration (alternative SMS provider)
PLIVO_AUTH_ID=your_plivo_auth_id_here
PLIVO_AUTH_TOKEN=your_plivo_auth_token_here
PLIVO_PHONE_NUMBER=+1234567890
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up your environment variables in `.env` file

3. Run the project:
   ```bash
   node index.js
   ```

4. The server will start on the configured port (default: 3000)

## Security

⚠️ **Important**: Never commit your `.env` file or any files containing API keys to version control. The `.gitignore` file is configured to exclude sensitive files.

## API Endpoints

- `POST /auth/request-otp` - Request OTP via SMS
- `POST /auth/verify-otp` - Verify OTP and get JWT token
- `POST /ai/get-calories` - Analyze food image for calories
- `GET /meals` - Get user meals
- `POST /meals` - Create new meal
- `GET /meals/summary/daily` - Get daily nutrition summary
- `GET /meals/calendar` - Get weekly calendar data
- `PATCH /users/profile` - Update user profile
- `GET /app/calendar` - Get app-formatted calendar data 