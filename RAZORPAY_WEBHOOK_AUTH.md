# Razorpay Webhook Authentication Guide

## How Razorpay Webhook Secret Authentication Works

### **1. Webhook Secret Generation**
- **Razorpay Dashboard**: Go to Settings → Webhooks → Create New Webhook
- **Secret Generation**: Razorpay automatically generates a unique secret for your webhook
- **Secret Format**: Usually a long random string (e.g., `whsec_1234567890abcdef...`)

### **2. Signature Generation Process**
Razorpay creates a signature using HMAC-SHA256:

```javascript
// Razorpay's process (simplified)
const signature = crypto
  .createHmac('sha256', webhook_secret)
  .update(webhook_payload_json)
  .digest('hex');
```

### **3. Webhook Request Headers**
Razorpay sends these headers with each webhook:
```
X-Razorpay-Signature: a1b2c3d4e5f6... (HMAC-SHA256 signature)
X-Razorpay-Event-Id: evt_1234567890 (Unique event ID)
Content-Type: application/json
```

### **4. Our Verification Process**
```javascript
function verifyRazorpaySignature(body, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}
```

## **Environment Setup**

### **1. Add to .env file:**
```env
RAZORPAY_WEBHOOK_SECRET=whsec_your_actual_secret_here
```

### **2. Get Your Webhook Secret:**
1. Go to Razorpay Dashboard → Settings → Webhooks
2. Create/Edit your webhook
3. Copy the "Webhook Secret" value
4. Add it to your `.env` file

## **Security Benefits**

### **1. Prevents Unauthorized Access**
- Only requests with valid signatures are processed
- Invalid signatures return 401 Unauthorized
- Protects against malicious webhook calls

### **2. Ensures Data Integrity**
- Verifies the payload hasn't been tampered with
- Confirms the request came from Razorpay
- Prevents replay attacks

### **3. Production Security**
- Never expose the webhook secret in code
- Use environment variables
- Rotate secrets periodically

## **Testing Webhook Authentication**

### **1. Test with Valid Signature:**
```bash
# Generate a test signature (for testing only)
const crypto = require('crypto');
const secret = 'your_webhook_secret';
const payload = JSON.stringify({"event": "subscription.created"});
const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

# Use in curl
curl -X POST http://localhost:3000/webhooks/razorpay \
  -H "Content-Type: application/json" \
  -H "X-Razorpay-Signature: $signature" \
  -d '{"event": "subscription.created", "payload": {"subscription": {"entity": {"id": "sub_123"}}}}'
```

### **2. Test with Invalid Signature:**
```bash
# This should return 401 Unauthorized
curl -X POST http://localhost:3000/webhooks/razorpay \
  -H "Content-Type: application/json" \
  -H "X-Razorpay-Signature: invalid_signature" \
  -d '{"event": "subscription.created"}'
```

## **Logging Output Examples**

### **Successful Webhook:**
```
=== RAZORPAY WEBHOOK RECEIVED ===
Event ID: evt_1234567890
Event Type: subscription.activated
Subscription ID: sub_RMzainB4A0KBCv
Timestamp: 2024-01-15T10:30:00.000Z
Headers: {
  'x-razorpay-signature': 'present',
  'x-razorpay-event-id': 'evt_1234567890',
  'content-type': 'application/json'
}
✅ Webhook signature verified successfully
🔍 Looking up subscription: sub_RMzainB4A0KBCv
✅ Found external subscription
User ID: 6885ffab796e2e888bff0999
Current Status: created
🔄 STATUS UPDATE
Subscription ID: sub_RMzainB4A0KBCv
Old Status: created
New Status: active
Event Type: subscription.activated
✅ WEBHOOK PROCESSED SUCCESSFULLY
Event: subscription.activated
Subscription ID: sub_RMzainB4A0KBCv
Event ID: evt_1234567890
Payment Event ID: 507f1f77bcf86cd799439011
Processed at: 2024-01-15T10:30:00.000Z
```

### **Invalid Signature:**
```
=== RAZORPAY WEBHOOK RECEIVED ===
Event ID: evt_1234567890
Event Type: subscription.activated
Subscription ID: sub_RMzainB4A0KBCv
Timestamp: 2024-01-15T10:30:00.000Z
Headers: {
  'x-razorpay-signature': 'present',
  'x-razorpay-event-id': 'evt_1234567890',
  'content-type': 'application/json'
}
❌ INVALID WEBHOOK SIGNATURE
Expected secret: whsec_your_actual_secret_here
Received signature: invalid_signature_here
```

### **Duplicate Event:**
```
=== RAZORPAY WEBHOOK RECEIVED ===
Event ID: evt_1234567890
Event Type: subscription.activated
Subscription ID: sub_RMzainB4A0KBCv
Timestamp: 2024-01-15T10:30:00.000Z
Headers: {
  'x-razorpay-signature': 'present',
  'x-razorpay-event-id': 'evt_1234567890',
  'content-type': 'application/json'
}
✅ Webhook signature verified successfully
🔄 DUPLICATE EVENT DETECTED
Event ID: evt_1234567890
Event Type: subscription.activated
Already processed at: 2024-01-15T10:29:45.000Z
Returning success to prevent retries
```

## **Troubleshooting**

### **1. Signature Verification Fails:**
- Check if `RAZORPAY_WEBHOOK_SECRET` is set correctly
- Ensure the secret matches the one in Razorpay dashboard
- Verify the payload is being parsed correctly

### **2. Webhook Not Receiving Events:**
- Check if webhook URL is accessible (use ngrok for local testing)
- Verify webhook is configured in Razorpay dashboard
- Check if correct events are subscribed

### **3. Duplicate Events:**
- This is normal behavior (at-least-once delivery)
- Our system handles duplicates gracefully
- Check logs for "DUPLICATE EVENT DETECTED"

## **Production Checklist**

- [ ] Webhook secret is set in environment variables
- [ ] Webhook URL is HTTPS (required by Razorpay)
- [ ] All required events are subscribed
- [ ] Signature verification is working
- [ ] Duplicate event handling is tested
- [ ] Error logging is comprehensive
- [ ] Response time is under 5 seconds
