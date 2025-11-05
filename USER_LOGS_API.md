# User Logs API Documentation

## Overview
The User Logs API allows users to log and track various metrics over time. Currently supports weight logging, with the ability to extend to other types in the future.

## Endpoints

### POST `/user-logs`
Create a new user log entry or update existing entry for the same date.

**Authentication**: Required (JWT Bearer Token)

---

## Schema

### UserLog Collection
```javascript
{
  userId: ObjectId,      // Reference to User (from auth token)
  type: String,          // Enum: "WEIGHT" (extensible)
  value: Number,         // The logged value (e.g., 75.5 for weight)
  unit: String,          // Unit of measurement (e.g., "kg", "lbs")
  date: Date,            // Date in YYYY-MM-DD format (defaults to today)
  createdAt: Date,       // Auto-generated timestamp
  updatedAt: Date        // Auto-generated timestamp
}
```

### Indexes
- `userId` - Single index
- `date` - Single index
- `userId + date` - Compound index
- `userId + type + date` - Compound index (unique)

---

## Request

### Endpoint
```
POST /user-logs
```

### Headers
```
Content-Type: application/json
Authorization: Bearer <your_jwt_token>
```

### Request Body
```json
{
  "type": "WEIGHT",      // Required: Currently only "WEIGHT" is supported
  "value": 75.5,         // Required: Positive number
  "unit": "kg",          // Required: String (e.g., "kg", "lbs")
  "date": "2024-01-15"   // Optional: YYYY-MM-DD format (defaults to today)
}
```

### Field Details

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `type` | string | ✅ | Log type | `"WEIGHT"` |
| `value` | number | ✅ | The value to log | `75.5` |
| `unit` | string | ✅ | Unit of measurement | `"kg"`, `"lbs"` |
| `date` | string | ❌ | Date in YYYY-MM-DD format | `"2024-01-15"` (defaults to today) |

---

## Response

### Success Response (201 Created)
```json
{
  "success": true,
  "message": "Log created successfully",
  "data": {
    "_id": "65f1234567890abcdef12345",
    "userId": "65f1234567890abcdef12340",
    "type": "WEIGHT",
    "value": 75.5,
    "unit": "kg",
    "date": "2024-01-15",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Success Response (200 Updated)
If a log already exists for the same user, type, and date, it will be updated:
```json
{
  "success": true,
  "message": "Log updated successfully",
  "data": {
    "_id": "65f1234567890abcdef12345",
    "userId": "65f1234567890abcdef12340",
    "type": "WEIGHT",
    "value": 75.2,
    "unit": "kg",
    "date": "2024-01-15",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T11:45:00.000Z"
  }
}
```

---

## Error Responses

### 400 Bad Request - Missing Fields
```json
{
  "success": false,
  "error": "Missing required fields: type, value, and unit are required"
}
```

### 400 Bad Request - Invalid Type
```json
{
  "success": false,
  "error": "Invalid type. Allowed values: WEIGHT"
}
```

### 400 Bad Request - Invalid Value
```json
{
  "success": false,
  "error": "value must be a positive number"
}
```

### 400 Bad Request - Invalid Date Format
```json
{
  "success": false,
  "error": "date must be in YYYY-MM-DD format"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Authentication required. Please provide a valid JWT token."
}
```

### 409 Conflict - Duplicate Log
```json
{
  "success": false,
  "error": "A log already exists for this user, type, and date"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Failed to create user log",
  "details": "Error message"
}
```

---

## Sample cURL Commands

### Example 1: Log Weight for Today (Default Date)
```bash
curl -X POST http://localhost:3000/user-logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "type": "WEIGHT",
    "value": 75.5,
    "unit": "kg"
  }'
```

### Example 2: Log Weight for Specific Date
```bash
curl -X POST http://localhost:3000/user-logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "type": "WEIGHT",
    "value": 75.5,
    "unit": "kg",
    "date": "2024-01-15"
  }'
```

### Example 3: Log Weight in Pounds
```bash
curl -X POST http://localhost:3000/user-logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "type": "WEIGHT",
    "value": 166.5,
    "unit": "lbs"
  }'
```

### Example 4: Update Existing Log (Same Date)
```bash
# First call creates the log
curl -X POST http://localhost:3000/user-logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "type": "WEIGHT",
    "value": 75.5,
    "unit": "kg",
    "date": "2024-01-15"
  }'

# Second call with same date updates the log
curl -X POST http://localhost:3000/user-logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "type": "WEIGHT",
    "value": 75.2,
    "unit": "kg",
    "date": "2024-01-15"
  }'
```

---

## Behavior

1. **Date Defaulting**: If `date` is not provided, it defaults to today's date (start of day in UTC)
2. **Upsert Logic**: If a log exists for the same `userId`, `type`, and `date`, it will be updated instead of creating a duplicate
3. **Date Format**: Dates must be in `YYYY-MM-DD` format (e.g., `"2024-01-15"`)
4. **Value Validation**: Value must be a positive number (can be decimal)
5. **Unit**: Unit is stored as a string and trimmed (max 20 characters)

---

## Use Cases

### Daily Weight Tracking
Users can log their weight daily. If they log twice on the same day, the second entry updates the first.

### Historical Logging
Users can log weights for past dates by providing the `date` field.

### Multiple Units
Users can log in different units (kg, lbs, etc.) - the system doesn't enforce unit consistency.

---

## Future Extensibility

The `type` field uses an enum that can be extended. To add new types:

1. Update the enum in `models/schemas/UserLog.js`:
```javascript
enum: ['WEIGHT', 'BODY_FAT', 'MUSCLE_MASS', ...]
```

2. The rest of the API will automatically support the new type.

---

## Database Queries

### Find all logs for a user
```javascript
UserLog.find({ userId: userId }).sort({ date: -1 })
```

### Find logs for a date range
```javascript
UserLog.find({ 
  userId: userId,
  date: { $gte: startDate, $lte: endDate }
}).sort({ date: -1 })
```

### Find latest weight log
```javascript
UserLog.findOne({ 
  userId: userId,
  type: 'WEIGHT'
}).sort({ date: -1 })
```

---

## Notes

- The `userId` is automatically extracted from the JWT token - **do not** include it in the request body
- Dates are stored in UTC and normalized to start of day (00:00:00)
- The unique index ensures one log per user per type per date
- All timestamps are in ISO 8601 format
- The API returns dates in `YYYY-MM-DD` format for consistency

