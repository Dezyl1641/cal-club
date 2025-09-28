# Razorpay Webhook Integration

## Overview
This system handles Razorpay webhook events to automatically update subscription statuses and track payment events.

## Database Collections

### PaymentEvents Collection
- `merchant`: String (enum: RAZORPAY, STRIPE, PAYPAL)
- `external_subscription_id`: String (querable)
- `userId`: ObjectId (ref: User)
- `event_type`: String (Razorpay event name)
- `event_data`: Mixed (Full webhook payload)
- `external_idempotence_id`: String (unique, sparse)
- `processed`: Boolean (default: false)
- `processing_error`: String
- `createdAt`: Date
- `updatedAt`: Date

## API Endpoints

### 1. Razorpay Webhook Handler
- **Endpoint**: `POST /webhooks/razorpay`
- **Headers**: `X-Razorpay-Signature` (required for verification)
- **Purpose**: Handles all Razorpay subscription events

### 2. Get Payment Events
- **Endpoint**: `GET /webhooks/events`
- **Headers**: `Authorization: Bearer <jwt_token>`
- **Query Parameters**: 
  - `limit` (default: 50)
  - `offset` (default: 0)

## Supported Razorpay Events

| Event Type | Subscription Status | Description |
|------------|-------------------|-------------|
| `subscription.created` | `created` | Subscription created |
| `subscription.activated` | `active` | Subscription activated |
| `subscription.charged` | `active` | Payment successful |
| `subscription.paused` | `paused` | Subscription paused |
| `subscription.resumed` | `active` | Subscription resumed |
| `subscription.halted` | `halted` | Payment failed |
| `subscription.cancelled` | `cancelled` | Subscription cancelled |
| `subscription.completed` | `completed` | Subscription completed |
| `subscription.expired` | `expired` | Subscription expired |

## Environment Variables

Add to your `.env` file:
```env
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
```

## Razorpay Dashboard Setup

1. Go to Razorpay Dashboard → Settings → Webhooks
2. Create a new webhook with URL: `https://yourdomain.com/webhooks/razorpay`
3. Select events:
   - `subscription.created`
   - `subscription.activated`
   - `subscription.charged`
   - `subscription.paused`
   - `subscription.resumed`
   - `subscription.halted`
   - `subscription.cancelled`
   - `subscription.completed`
   - `subscription.expired`
4. Copy the webhook secret and add it to your `.env` file

## Webhook Security & Reliability

### **Signature Verification**
- All webhooks are verified using HMAC-SHA256
- Invalid signatures return 401 Unauthorized
- Prevents unauthorized webhook calls

### **Idempotency & Duplicate Handling**
- **Event ID Tracking**: Uses `x-razorpay-event-id` header stored as `external_idempotence_id`
- **At-Least-Once Delivery**: Razorpay may send the same event multiple times
- **Duplicate Prevention**: Returns success for already processed events
- **Status Updates**: Idempotent operations prevent duplicate status changes

### **Timeout Prevention**
- **5-Second Rule**: Razorpay expects response within 5 seconds
- **Quick Response**: Responds immediately after processing
- **Timeout Handling**: If timeout occurs, Razorpay will retry the webhook

### **Error Handling**
- **Graceful Failures**: Logs errors without exposing internal details
- **Retry Logic**: Failed events can be reprocessed manually
- **Event Storage**: All events stored regardless of processing success

## Testing Webhooks

### Using ngrok (for local testing)
```bash
# Install ngrok
npm install -g ngrok

# Start your server
yarn start

# In another terminal, expose your local server
ngrok http 3000

# Use the ngrok URL in Razorpay webhook settings
# Example: https://abc123.ngrok.io/webhooks/razorpay
```

### Manual Testing
```bash
# Test webhook endpoint
curl -X POST http://localhost:3000/webhooks/razorpay \
  -H "Content-Type: application/json" \
  -H "X-Razorpay-Signature: your_signature" \
  -d '{
    "event": "subscription.activated",
    "payload": {
      "subscription": {
        "entity": {
          "id": "sub_1234567890"
        }
      }
    }
  }'
```

## Event Processing Flow

1. **Webhook Received**: Razorpay sends event to `/webhooks/razorpay`
2. **Signature Verification**: Verify webhook authenticity
3. **Event Storage**: Store event in `payment_events` collection
4. **Status Update**: Update `external_subscriptions` status if applicable
5. **Response**: Return success/error response to Razorpay

## Monitoring

- Check `payment_events` collection for all received events
- Monitor `processed` field for successful processing
- Check `processing_error` field for any failures
- Use `GET /webhooks/events` to view user's payment history

## Error Handling

- Invalid signatures return 401
- Missing subscription IDs return 404
- Processing errors are logged and stored
- Failed events can be reprocessed manually
