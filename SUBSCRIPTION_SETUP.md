# Subscription System Setup

## Environment Variables Required

Add these to your `.env` file:

```env
# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_test_RMmMizee4NVoem
RAZORPAY_KEY_SECRET=f3LVnWA4up55jQrSL9eWaeIB
```

## API Endpoints Created

### 1. Create Subscription
- **Endpoint**: `POST /subscriptions`
- **Headers**: `Authorization: Bearer <jwt_token>`
- **Body**:
```json
{
  "external_plan_id": "your_plan_id_here"
}
```

### 2. Get User Subscription
- **Endpoint**: `GET /subscriptions`
- **Headers**: `Authorization: Bearer <jwt_token>`

## Database Collections Created

### 1. Plans Collection
- `title`: String (required)
- `description`: String (required)
- `duration`: Number (required)
- `durationUnit`: String (enum: day, week, month, year)
- `frequency`: String (required)
- `external_plan_id`: String (required, unique)
- `createdAt`: Date
- `updatedAt`: Date

### 2. External Subscriptions Collection
- `userId`: ObjectId (ref: User)
- `external_subscription_id`: String (required, unique)
- `external_plan_id`: String (required)
- `status`: String (enum: created, authenticated, active, paused, halted, cancelled, completed, expired)
- `createdAt`: Date
- `updatedAt`: Date

## Installation

Run the following command to install the Razorpay dependency:

```bash
npm install razorpay@^2.9.2
```

## Usage Example

```bash
# Create a subscription
curl -X POST http://localhost:3000/subscriptions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "external_plan_id": "plan_123"
  }'

# Get user subscription
curl -X GET http://localhost:3000/subscriptions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Notes

- The hardcoded Razorpay plan ID is `plan_RMmKQSHoN6JxiW`
- All subscription creation goes through Razorpay API
- User authentication is required for all subscription endpoints
- The system automatically creates subscriptions in Razorpay and stores the details locally
