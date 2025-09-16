# Onboarding System Documentation

## Overview
The onboarding system allows users to answer a series of questions during their initial app setup. This system includes question management, user answer storage, and soft deletion capabilities.

## Database Schemas

### questions Collection
Stores the onboarding questions that users can answer.

```javascript
{
  _id: ObjectId,
  text: String,           // The question text
  subtext: String,        // Optional explanatory text or instructions
  type: String,           // Type of input (text, number, select, multiselect, radio, checkbox, textarea, date, email, phone)
  options: [String],      // Available options for select/radio/multiselect inputs
  sequence: Number,       // Order of questions (enforced uniqueness)
  isActive: Boolean,      // Whether the question is currently active
  createdAt: Date,
  updatedAt: Date
}
```

### userQuestions Collection
Stores user answers to onboarding questions.

```javascript
{
  _id: ObjectId,
  userId: ObjectId,       // Reference to User
  questionId: ObjectId,   // Reference to Question
  values: [Mixed],        // Array of user's answers (can be strings, numbers, etc.)
  deletedAt: Date,        // Soft deletion timestamp (null if active)
  createdAt: Date,
  updatedAt: Date
}
```

## API Endpoints

### 1. Get Active Questions
**GET** `/onboarding/questions`

Returns all active questions ordered by sequence.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "question_id",
      "text": "What's your primary fitness goal?",
      "subtext": "This helps us personalize your nutrition recommendations",
      "type": "radio",
      "options": ["Weight Loss", "Weight Gain", "Muscle Building"],
      "sequence": 1
    }
  ],
  "count": 15
}
```

### 2. Save User Answers
**POST** `/onboarding/answers`

Saves user answers to onboarding questions. Requires authentication.

**Note:** The userId is automatically extracted from the JWT token, no need to include it in the request body.

**Request Body:**
```json
{
  "answers": [
    {
      "questionId": "question_id",
      "values": ["Weight Loss"]
    },
    {
      "questionId": "question_id_2",
      "values": [75]
    },
    {
      "questionId": "question_id_3", 
      "values": ["Lack of time", "Don't know what to eat"]
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully processed 2 answers",
  "data": [
    {
      "action": "created",
      "answer": { /* UserQuestion object */ }
    },
    {
      "action": "updated", 
      "answer": { /* UserQuestion object */ }
    }
  ]
}
```

### 3. Get User Answers
**GET** `/onboarding/answers`

Retrieves all answers for the authenticated user. Requires authentication.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "answer_id",
      "questionId": {
        "_id": "question_id",
        "text": "What's your primary fitness goal?",
        "subtext": "This helps us personalize your nutrition recommendations",
        "type": "radio",
        "options": ["Weight Loss", "Weight Gain"],
        "sequence": 1
      },
      "values": ["Weight Loss"],
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "count": 15
}
```

## Input Types

The system supports various input types for different question formats:

- **text**: Single line text input
- **number**: Numeric input
- **select**: Dropdown selection (single choice)
- **multiselect**: Multiple choice selection
- **radio**: Radio button selection (single choice)
- **checkbox**: Checkbox selection (multiple choices)
- **textarea**: Multi-line text input
- **date**: Date picker
- **email**: Email input with validation
- **phone**: Phone number input

## Soft Deletion

The system implements soft deletion for data integrity:

### User Deletion
When a user is deleted:
1. User account is deactivated (`isActive: false`)
2. All user answers are soft deleted (`deletedAt` set to current timestamp)
3. All user meals are soft deleted (`deletedAt` set to current timestamp)

### Meal Deletion
- Individual meals can be soft deleted
- All meal queries automatically filter out deleted meals
- `deletedAt` field is added to Meal schema

## Usage Examples

### Frontend Integration

```javascript
// Fetch onboarding questions
const response = await fetch('/onboarding/questions');
const { data: questions } = await response.json();

// Render questions in order
questions.forEach(question => {
  renderQuestion(question);
});

// Submit answers
const answers = [
  { userId: currentUserId, questionId: 'q1', value: 'Weight Loss' },
  { userId: currentUserId, questionId: 'q2', value: 75 }
];

const submitResponse = await fetch('/onboarding/answers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ answers })
});
```

### Populating Sample Questions

Run the sample questions script to populate the database:

```bash
node sample_questions.js
```

This will insert 15 sample onboarding questions covering fitness goals, personal information, dietary preferences, and tracking preferences.

## Database Indexes

### questions Collection
- `{ sequence: 1 }` - For ordering questions
- `{ isActive: 1, sequence: 1 }` - For fetching active questions in order

### userQuestions Collection  
- `{ userId: 1, questionId: 1 }` - For finding user's answer to specific question
- `{ userId: 1, deletedAt: 1 }` - For fetching user's active answers
- `{ questionId: 1, deletedAt: 1 }` - For question analytics
- `{ userId: 1, questionId: 1, deletedAt: 1 }` - Unique constraint for active answers

### Meals Collection
- `{ userId: 1, capturedAt: -1 }` - For user's meal history
- `{ userId: 1, deletedAt: 1 }` - For soft deletion queries

## Error Handling

All endpoints include comprehensive error handling:
- Input validation
- Database error handling
- Proper HTTP status codes
- Detailed error messages

## Security Considerations

- Authentication required for answer submission and retrieval
- Input validation and sanitization
- Soft deletion prevents data loss
- Unique constraints prevent duplicate answers
