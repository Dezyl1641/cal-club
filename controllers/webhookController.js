const crypto = require('crypto');
const PaymentEvent = require('../models/schemas/PaymentEvent');
const ExternalSubscription = require('../models/schemas/ExternalSubscription');
const parseBody = require('../utils/parseBody');

// Razorpay webhook signature verification
function verifyRazorpaySignature(body, signature, secret) {
  if (!body || !signature || !secret) {
    console.error('Missing required parameters for signature verification');
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    console.error('Error in signature verification:', error.message);
    return false;
  }
}

// Map Razorpay event types to subscription status
const eventStatusMap = {
  'subscription.created': 'created',
  'subscription.activated': 'active',
  'subscription.charged': 'active',
  'subscription.paused': 'paused',
  'subscription.resumed': 'active',
  'subscription.halted': 'halted',
  'subscription.cancelled': 'cancelled',
  'subscription.completed': 'completed',
  'subscription.expired': 'expired'
};

async function handleRazorpayWebhook(req, res) {
  let body = null;
  try {
    body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const signature = req.headers['x-razorpay-signature'];
    const eventId = req.headers['x-razorpay-event-id'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Log incoming webhook request
    console.log('=== RAZORPAY WEBHOOK RECEIVED ===');
    console.log('Event ID:', eventId);
    console.log('Event Type:', body.event);
    console.log('Subscription ID:', body.payload?.subscription?.entity?.id || body.payload?.subscription?.id);
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', {
      'x-razorpay-signature': signature ? 'present' : 'missing',
      'x-razorpay-event-id': eventId || 'missing',
      'content-type': req.headers['content-type']
    });

    // Verify webhook signature
    if (!body || !signature || !webhookSecret) {
      console.error('❌ MISSING REQUIRED DATA');
      console.error('Body:', body ? 'present' : 'missing');
      console.error('Signature:', signature ? 'present' : 'missing');
      console.error('Webhook Secret:', webhookSecret ? 'present' : 'missing');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required data' }));
      return;
    }

    if (!verifyRazorpaySignature(JSON.stringify(body), signature, webhookSecret)) {
      console.error('❌ INVALID WEBHOOK SIGNATURE');
      console.error('Expected secret:', webhookSecret);
      console.error('Received signature:', signature);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid signature' }));
      return;
    }

    console.log('✅ Webhook signature verified successfully');

    // Check for duplicate events using x-razorpay-event-id
    if (eventId) {
      const existingEvent = await PaymentEvent.findOne({ external_idempotence_id: eventId });
      if (existingEvent) {
        console.log('🔄 DUPLICATE EVENT DETECTED');
        console.log('Event ID:', eventId);
        console.log('Event Type:', body.event);
        console.log('Already processed at:', existingEvent.createdAt);
        console.log('Returning success to prevent retries');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Duplicate event already processed',
          event_id: eventId
        }));
        return;
      }
    }

    const { event, payload } = body;
    const subscriptionId = payload.subscription?.entity?.id || payload.subscription?.id;

    if (!subscriptionId) {
      console.error('❌ NO SUBSCRIPTION ID FOUND');
      console.error('Payload structure:', JSON.stringify(payload, null, 2));
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No subscription ID found' }));
      return;
    }

    console.log('🔍 Looking up subscription:', subscriptionId);

    // Find the external subscription
    const externalSubscription = await ExternalSubscription.findOne({
      external_subscription_id: subscriptionId
    });

    if (!externalSubscription) {
      console.error('❌ EXTERNAL SUBSCRIPTION NOT FOUND');
      console.error('Subscription ID:', subscriptionId);
      console.error('Event Type:', event);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Subscription not found' }));
      return;
    }

    console.log('✅ Found external subscription');
    console.log('User ID:', externalSubscription.userId);
    console.log('Current Status:', externalSubscription.status);

    // Create payment event record with idempotency
    const paymentEvent = new PaymentEvent({
      merchant: 'RAZORPAY',
      external_subscription_id: subscriptionId,
      userId: externalSubscription.userId,
      event_type: event,
      event_data: payload,
      external_idempotence_id: eventId || null,
      processed: false
    });

    await paymentEvent.save();

    // Update subscription status if applicable (idempotent operation)
    const newStatus = eventStatusMap[event];
    if (newStatus && newStatus !== externalSubscription.status) {
      const oldStatus = externalSubscription.status;
      externalSubscription.status = newStatus;
      await externalSubscription.save();
      
      console.log('🔄 STATUS UPDATE');
      console.log('Subscription ID:', subscriptionId);
      console.log('Old Status:', oldStatus);
      console.log('New Status:', newStatus);
      console.log('Event Type:', event);
    } else {
      console.log('ℹ️  No status change needed');
      console.log('Current Status:', externalSubscription.status);
      console.log('Event Status:', newStatus);
    }

    // Mark event as processed
    paymentEvent.processed = true;
    await paymentEvent.save();

    console.log('✅ WEBHOOK PROCESSED SUCCESSFULLY');
    console.log('Event:', event);
    console.log('Subscription ID:', subscriptionId);
    console.log('Event ID:', eventId);
    console.log('Payment Event ID:', paymentEvent._id);
    console.log('Processed at:', new Date().toISOString());

    // Respond quickly to prevent timeout (within 5 seconds)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      message: 'Webhook processed successfully',
      event: event,
      subscription_id: subscriptionId,
      event_id: eventId
    }));

  } catch (error) {
    console.error('❌ WEBHOOK PROCESSING ERROR');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Event ID:', req.headers['x-razorpay-event-id']);
    console.error('Event Type:', body?.event || 'unknown');
    console.error('Body Present:', body ? 'yes' : 'no');
    console.error('Timestamp:', new Date().toISOString());
    
    // Log the error but don't expose internal details
    const errorResponse = {
      error: 'Failed to process webhook',
      timestamp: new Date().toISOString()
    };

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
  }
}

async function getPaymentEvents(req, res) {
  try {
    const userId = req.user.userId;
    const { limit = 50, offset = 0 } = req.query;

    const events = await PaymentEvent.find({ userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      events: events,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: events.length
      }
    }));

  } catch (error) {
    console.error('Error fetching payment events:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to fetch payment events',
      details: error.message 
    }));
  }
}

module.exports = {
  handleRazorpayWebhook,
  getPaymentEvents
};
