# Onboarding API - Sample cURL Commands

## Base URL
Assuming your server is running on `http://localhost:3000` or your deployed URL.

## Authentication
Most endpoints require authentication. Include the auth token in the header:
```bash
-H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

---

## 1. Get Active Questions
**GET** `/onboarding/questions`

Returns all active questions ordered by sequence.

### cURL Command:
```bash
curl -X GET "http://localhost:3000/onboarding/questions" \
  -H "Content-Type: application/json"
```

**Note:** This endpoint does NOT require authentication.

### Expected Response:
```json
{
  "success": true,
  "data": [
    {
      "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
      "text": "Welcome to Cal Club!",
      "subtext": "Watch how easy it is to track your meals and reach your goals",
      "type": "NO_INPUT",
      "options": [],
      "sequence": 1
    },
    {
      "_id": "60f7b3b3b3b3b3b3b3b3b3b4",
      "text": "What's your gender?",
      "subtext": "This helps us calculate your personalized calorie needs",
      "type": "SELECT",
      "options": ["Male", "Female", "Other", "Prefer not to say"],
      "sequence": 2
    }
  ],
  "count": 25
}
```

---

## 2. Save User Answers
**POST** `/onboarding/answers`

Saves user answers to onboarding questions. Requires authentication.

**Note:** The userId is automatically extracted from the JWT token, no need to include it in the request body.

### cURL Command:
```bash
curl -X POST "http://localhost:3000/onboarding/answers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "answers": [
      {
        "questionId": "60f7b3b3b3b3b3b3b3b3b3b4",
        "values": ["Male"]
      },
      {
        "questionId": "60f7b3b3b3b3b3b3b3b3b3b5",
        "values": ["3-4 times per week"]
      },
      {
        "questionId": "60f7b3b3b3b3b3b3b3b3b3b6",
        "values": ["Social Media"]
      },
      {
        "questionId": "60f7b3b3b3b3b3b3b3b3b3b7",
        "values": ["Yes, I've tried one or two"]
      },
      {
        "questionId": "60f7b3b3b3b3b3b3b3b3b3b8",
        "va "userId": "60f7b3b3b3b3b3b3b3b3b3b1",
        "questionId": "60f7b3b3b3b3b3b3b3b3b3bd",
        "values": ["0.5 kg"]
      },
      {
        "questionId": "60f7b3b3b3b3b3b3b3b3b3be",
        "values": ["Lack of time", "Don't know what to eat"]
      },
      {
        "questionId": "60f7b3b3b3b3b3b3b3b3b3bf",
        "values": ["No specific diet"]
      },
      {
        "questionId": "60f7b3b3b3b3b3b3b3b3b3c0",
        "values": ["I want to feel confident in my own skin and have more energy throughout the day"]
      },
      {
        "questionId": "60f7b3b3b3b3b3b3b3b3b3c1",
        "values": ["FRIEND123"]
      }
    ]lues": [175]
      },
      {
        "questionId": "60f7b3b3b3b3b3b3b3b3b3b9",
        "values": [70]
      },
      {
        "questionId": "60f7b3b3b3b3b3b3b3b3b3ba",
        "values": ["1990-05-15"]
      },
      {
        "questionId": "60f7b3b3b3b3b3b3b3b3b3bb",
        "values": ["Lose weight"]
      },
      {
        "questionId": "60f7b3b3b3b3b3b3b3b3b3bc",
        "values": [65]
      },
      {
       
  }'
```

### Expected Response:
```json
{
  "success": true,
  "message": "Successfully processed 14 answers",
  "data": [
    {
      "action": "created",
      "answer": {
        "_id": "60f7b3b3b3b3b3b3b3b3b3c2",
        "questionId": "60f7b3b3b3b3b3b3b3b3b3b4",
        "values": ["Male"],
        "createdAt": "2024-01-15T10:30:00.000Z"
      }
    }
  ]
}
```

---

## 3. Get User Answers
**GET** `/onboarding/answers`

Retrieves all answers for the authenticated user. Requires authentication.

### cURL Command:
```bash
curl -X GET "http://localhost:3000/onboarding/answers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

**Note:** The user ID is automatically extracted from the JWT token, no need to specify it in the URL.

### Expected Response:
```json
{
  "success": true,
  "data": [
    {
      "_id": "60f7b3b3b3b3b3b3b3b3b3c2",
      "userId": "60f7b3b3b3b3b3b3b3b3b3b1",
      "questionId": {
        "_id": "60f7b3b3b3b3b3b3b3b3b3b4",
        "text": "What's your gender?",
        "subtext": "This helps us calculate your personalized calorie needs",
        "type": "SELECT",
        "options": ["Male", "Female", "Other", "Prefer not to say"],
        "sequence": 2
      },
      "values": ["Male"],
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "_id": "60f7b3b3b3b3b3b3b3b3b3c3",
      "userId": "60f7b3b3b3b3b3b3b3b3b3b1",
      "questionId": {
        "_id": "60f7b3b3b3b3b3b3b3b3b3b5",
        "text": "How often do you work out?",
        "subtext": "This affects your daily calorie requirements",
        "type": "SELECT",
        "options": ["Never", "1-2 times per week", "3-4 times per week", "5-6 times per week", "Daily", "More than once a day"],
        "sequence": 3
      },
      "values": ["3-4 times per week"],
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 14
}
```

---

## Complete Onboarding Flow Example

Here's a complete example showing how to get questions and then submit answers:

### Step 1: Get Questions
```bash
curl -X GET "http://localhost:3000/onboarding/questions" \
  -H "Content-Type: application/json"
```

### Step 2: Submit Answers (after user completes onboarding)
```bash
curl -X POST "http://localhost:3000/onboarding/answers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "answers": [
      {
        "userId": "USER_ID_HERE",
        "questionId": "QUESTION_ID_FROM_STEP_1",
        "values": ["ANSWER_VALUE"]
      }
    ]
  }'
```

### Step 3: Verify Answers
```bash
curl -X GET "http://localhost:3000/onboarding/answers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

---

## Error Examples

### Invalid Request Body
```bash
curl -X POST "http://localhost:3000/onboarding/answers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "answers": "invalid_format"
  }'
```

**Response:**
```json
{
  "success": false,
  "message": "Answers array is required"
}
```

### Missing Authentication
```bash
curl -X POST "http://localhost:3000/onboarding/answers" \
  -H "Content-Type: application/json" \
  -d '{
    "answers": []
  }'
```

**Response:**
```json
{
  "success": false,
  "message": "Authentication required"
}
```

### Invalid Answer Format
```bash
curl -X POST "http://localhost:3000/onboarding/answers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "answers": [
      {
        "questionId": "60f7b3b3b3b3b3b3b3b3b3b4",
        "value": "Male"
      }
    ]
  }'
```

**Response:**
```json
{
  "success": false,
  "message": "Failed to save answers",
  "error": "Each answer must have userId, questionId, and values array"
}
```

---

## Notes

1. **Authentication**: Replace `YOUR_AUTH_TOKEN` with the actual JWT token from your authentication system
2. **User ID**: Replace `USER_ID_HERE` with the actual user ID
3. **Question IDs**: Get these from the questions endpoint response
4. **Values Array**: Always use an array, even for single values: `["single_value"]`
5. **Base URL**: Update the base URL to match your server configuration
6. **Content-Type**: Always include `Content-Type: application/json` header for POST requests
