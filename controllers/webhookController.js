const PaymentEvent = require('../models/schemas/PaymentEvent');
const Subscription = require('../models/schemas/Subscription');
const Membership = require('../models/schemas/Membership');
const Plan = require('../models/schemas/Plan');
const parseBody = require('../utils/parseBody');
const { reportError } = require('../utils/sentryReporter');

// Note: Signature verification removed as it's disabled in Razorpay dashboard

/**
 * Calculate end date based on plan duration
 */
function calculateEndDate(startDate, plan) {
  const endDate = new Date(startDate);
  
  // Add duration based on plan
  if (plan.durationUnit === 'day' || plan.durationUnit === 'days') {
    endDate.setDate(endDate.getDate() + plan.duration);
  } else if (plan.durationUnit === 'week' || plan.durationUnit === 'weeks') {
    endDate.setDate(endDate.getDate() + (plan.duration * 7));
  } else if (plan.durationUnit === 'month' || plan.durationUnit === 'months') {
    endDate.setMonth(endDate.getMonth() + plan.duration);
  } else if (plan.durationUnit === 'year' || plan.durationUnit === 'years') {
    endDate.setFullYear(endDate.getFullYear() + plan.duration);
  }
  
  // Round to end of day
  endDate.setHours(23, 59, 59, 999);
  
  return endDate;
}

/**
 * Create initial membership (on first payment/authentication)
 */
async function createMembership(subscription, plan) {
  try {
    const startDate = new Date();
    const endDate = calculateEndDate(startDate, plan);
    
    const membership = new Membership({
      userId: subscription.userId,
      subscriptionId: subscription._id,
      planId: plan._id,
      start: startDate,
      end: endDate,
      status: 'purchased'
    });
    
    await membership.save();
    
    console.log('✅ [RAZORPAY] MEMBERSHIP CREATED (Initial)');
    console.log('   User ID:', subscription.userId);
    console.log('   Plan:', plan.title);
    console.log('   Start:', startDate);
    console.log('   End:', endDate);
    console.log('   Duration:', plan.duration, plan.durationUnit);
    
    return membership;
  } catch (error) {
    reportError(error, { extra: { context: 'createMembership', subscriptionId: subscription?.userId } });
    console.error('❌ [RAZORPAY] ERROR CREATING MEMBERSHIP:', error);
    throw error;
  }
}

/**
 * Create new membership for subscription renewal
 * Each renewal creates a new membership record for that billing cycle
 */
async function createRenewalMembership(subscription, plan) {
  try {
    // Find the latest membership to determine the new start date
    const latestMembership = await Membership.findOne({
      subscriptionId: subscription._id
    }).sort({ end: -1 });

    let startDate;
    
    if (latestMembership && latestMembership.end > new Date()) {
      // If current membership hasn't expired, new one starts after it
      startDate = new Date(latestMembership.end);
      startDate.setSeconds(startDate.getSeconds() + 1); // Start 1 second after previous ends
    } else {
      // If no membership or expired, start from now
      startDate = new Date();
    }
    
    // Reset to start of day for clean dates
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = calculateEndDate(startDate, plan);

    // Check if membership for this exact period already exists (idempotency)
    // Check within a 1-minute window to handle timing differences
    const existingMembership = await Membership.findOne({
      subscriptionId: subscription._id,
      start: { 
        $gte: new Date(startDate.getTime() - 60000),  // 1 minute before
        $lte: new Date(startDate.getTime() + 60000)   // 1 minute after
      }
    });

    if (existingMembership) {
      console.log('⚠️ [RAZORPAY] Renewal membership for this period already exists:', existingMembership._id);
      return existingMembership;
    }

    const newMembership = new Membership({
      userId: subscription.userId,
      subscriptionId: subscription._id,
      planId: plan._id,
      start: startDate,
      end: endDate,
      status: 'purchased'
    });
    
    await newMembership.save();
    
    console.log('✅ [RAZORPAY] MEMBERSHIP CREATED (Renewal)');
    console.log('   User ID:', subscription.userId);
    console.log('   Membership ID:', newMembership._id);
    console.log('   Plan:', plan.title);
    console.log('   Start:', startDate);
    console.log('   End:', endDate);
    console.log('   Duration:', plan.duration, plan.durationUnit);
    
    return newMembership;
  } catch (error) {
    reportError(error, { extra: { context: 'createRenewalMembership', subscriptionId: subscription?.userId } });
    console.error('❌ [RAZORPAY] ERROR CREATING RENEWAL MEMBERSHIP:', error);
    throw error;
  }
}

// Map Razorpay event types to subscription status
const eventStatusMap = {
  'subscription.created': 'created',
  'subscription.authenticated': 'active',
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
  console.log('handleRazorpayWebhook: request received');
  let body = null;
  try {
    body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    console.log('handleRazorpayWebhook: body: ' + JSON.stringify(body));
    const eventId = req.headers['x-razorpay-event-id'];

    // Log incoming webhook request
    console.log('=== RAZORPAY WEBHOOK RECEIVED ===');
    console.log('Event ID:', eventId);
    console.log('Event Type:', body.event);
    console.log('Subscription ID:', body.payload?.subscription?.entity?.id || body.payload?.subscription?.id);
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', {
      'x-razorpay-event-id': eventId || 'missing',
      'content-type': req.headers['content-type']
    });

    // Check if body is present
    if (!body) {
      console.error('❌ MISSING BODY DATA');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing body data' }));
      return;
    }

    console.log('✅ Webhook data validated successfully');

    // Check for duplicate events using idempotence_id
    const existingEvent = await PaymentEvent.findOne({ idempotence_id: eventId });
    if (existingEvent) {
      console.log('⚠️ DUPLICATE EVENT DETECTED - Already processed:', eventId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        message: 'Event already processed',
        eventId: eventId 
      }));
      return;
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

    // Find the subscription
    const subscription = await Subscription.findOne({
      external_subscription_id: subscriptionId
    });

    if (!subscription) {
      console.error('❌ SUBSCRIPTION NOT FOUND');
      console.error('Subscription ID:', subscriptionId);
      console.error('Event Type:', event);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Subscription not found' }));
      return;
    }

    console.log('✅ Found subscription');
    console.log('User ID:', subscription.userId);
    console.log('Current Status:', subscription.status);

    // Create payment event record
    const paymentEvent = new PaymentEvent({
      merchant: 'RAZORPAY',
      external_subscription_id: subscriptionId,
      userId: subscription.userId,
      event_type: event,
      event_data: payload,
      idempotence_id: eventId,
      processed: false
    });

    await paymentEvent.save();

    // Update subscription status if applicable (idempotent operation)
    const newStatus = eventStatusMap[event];
    if (newStatus && newStatus !== subscription.status) {
      const oldStatus = subscription.status;
      subscription.status = newStatus;
      await subscription.save();
      
      console.log('🔄 STATUS UPDATE');
      console.log('Subscription ID:', subscriptionId);
      console.log('Old Status:', oldStatus);
      console.log('New Status:', newStatus);
      console.log('Event Type:', event);
    } else {
      console.log('ℹ️  No status change needed');
      console.log('Current Status:', subscription.status);
      console.log('Event Status:', newStatus);
    }

    // Create membership for subscription.authenticated event (first payment)
    if (event === 'subscription.authenticated') {
      try {
        // Find the plan using external_plan_id
        const plan = await Plan.findOne({ external_plan_id: subscription.external_plan_id });
        
        if (!plan) {
          console.error('❌ [RAZORPAY] PLAN NOT FOUND');
          console.error('   External Plan ID:', subscription.external_plan_id);
        } else {
          await createMembership(subscription, plan);
        }
      } catch (error) {
        reportError(error, { req, extra: { context: 'razorpay_membership_creation' } });
        console.error('❌ [RAZORPAY] ERROR CREATING MEMBERSHIP:', error);
        // Don't fail the webhook for membership creation errors
      }
    }

    // Create new membership for subscription.charged event (renewals)
    // Note: subscription.charged is also sent on first payment, but we check if membership exists
    if (event === 'subscription.charged') {
      try {
        // Check if this is first charge or renewal
        const existingMembership = await Membership.findOne({
          subscriptionId: subscription._id
        });

        if (existingMembership) {
          // This is a renewal - create new membership for the new billing cycle
          console.log('🔄 [RAZORPAY] Processing subscription renewal...');
          
          const plan = await Plan.findOne({ external_plan_id: subscription.external_plan_id });
          
          if (!plan) {
            console.error('❌ [RAZORPAY] PLAN NOT FOUND FOR RENEWAL');
            console.error('   External Plan ID:', subscription.external_plan_id);
          } else {
            await createRenewalMembership(subscription, plan);
          }
        } else {
          // First charge - membership should be created by subscription.authenticated
          console.log('ℹ️ [RAZORPAY] First charge detected, membership will be created by authenticated event');
        }
      } catch (error) {
        reportError(error, { req, extra: { context: 'razorpay_renewal' } });
        console.error('❌ [RAZORPAY] ERROR PROCESSING RENEWAL:', error);
        // Don't fail the webhook for membership creation errors
      }
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
    reportError(error, { req });
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
    // Check if user is authenticated
    if (!req.user || !req.user.userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Authentication required',
        message: 'This endpoint requires authentication' 
      }));
      return;
    }

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
    reportError(error, { req });
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
