/**
 * RevenueCat Webhook Handler.
 *
 * Receives events from RevenueCat (INITIAL_PURCHASE, RENEWAL, CANCELLATION,
 * EXPIRATION, BILLING_ISSUE, PRODUCT_CHANGE, etc.) and syncs them to local
 * Subscription + Membership records for audit.
 *
 * RevenueCat is the source of truth for entitlements -- these local records
 * are for your own analytics / audit purposes.
 */

const Subscription = require('../models/schemas/Subscription');
const Membership = require('../models/schemas/Membership');
const Plan = require('../models/schemas/Plan');
const PaymentEvent = require('../models/schemas/PaymentEvent');
const parseBody = require('../utils/parseBody');
const { reportError } = require('../utils/sentryReporter');
const { REVENUECAT_WEBHOOK_AUTH } = require('../config/revenuecat');
const { invalidateCache } = require('../utils/membershipCheck');

/**
 * Map RC store to our provider enum.
 */
function mapStore(store) {
  const storeMap = {
    'APP_STORE': 'APPLE',
    'PLAY_STORE': 'GOOGLE_PLAY',
    'STRIPE': 'STRIPE',
    'RC_BILLING': 'STRIPE', // RevenueCat Web Billing uses Stripe
    'PROMOTIONAL': 'RAZORPAY' // Promotional = granted via API (our Razorpay UPI flow)
  };
  return storeMap[store] || 'RAZORPAY';
}

/**
 * Map RC event type to Subscription status.
 */
function mapEventToStatus(eventType) {
  const statusMap = {
    'INITIAL_PURCHASE': 'active',
    'RENEWAL': 'active',
    'NON_RENEWING_PURCHASE': 'active', // Promotional grants from RC API
    'PRODUCT_CHANGE': 'active',
    'CANCELLATION': 'cancelled',
    'UNCANCELLATION': 'active',
    'EXPIRATION': 'expired',
    'BILLING_ISSUE': 'in_grace_period',
    'SUBSCRIBER_ALIAS': null // No status change
  };
  return statusMap[eventType] || null;
}

/**
 * POST /webhooks/revenuecat
 */
async function handleRevenueCatWebhook(req, res) {
  console.log('🔔 [REVENUECAT] Webhook received');

  // Respond quickly -- RC expects 200 within seconds
  // We'll process after sending response
  let body = null;

  try {
    body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  } catch (error) {
    reportError(error, { req });
    console.error('❌ [REVENUECAT] Failed to parse webhook body:', error.message);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid request body' }));
    return;
  }

  // Verify auth header
  if (REVENUECAT_WEBHOOK_AUTH) {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${REVENUECAT_WEBHOOK_AUTH}`) {
      console.error('❌ [REVENUECAT] Invalid webhook auth header');
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
  }

  // Respond 200 immediately
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ received: true }));

  // Process in background
  try {
    await processRevenueCatEvent(body);
  } catch (error) {
    reportError(error, { extra: { context: 'revenuecat_webhook_processing', body } });
    console.error('❌ [REVENUECAT] Error processing webhook:', error.message);
  }
}

/**
 * Process a single RevenueCat webhook event.
 */
async function processRevenueCatEvent(body) {
  const event = body?.event;
  if (!event) {
    console.warn('⚠️ [REVENUECAT] No event in webhook body');
    return;
  }

  const eventType = event.type;
  const appUserId = event.app_user_id;
  const store = event.store;
  const productId = event.product_id;
  const eventId = event.id;
  const expirationDate = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
  const purchaseDate = event.purchased_at_ms ? new Date(event.purchased_at_ms) : null;
  const periodType = event.period_type; // 'TRIAL', 'INTRO', 'NORMAL'

  console.log(`📋 [REVENUECAT] Event: ${eventType}`);
  console.log(`   User: ${appUserId}`);
  console.log(`   Store: ${store}`);
  console.log(`   Product: ${productId}`);
  console.log(`   Period: ${periodType}`);

  if (!appUserId) {
    console.warn('⚠️ [REVENUECAT] No app_user_id in event');
    return;
  }

  // Idempotency check
  const idempotenceId = `rc_${eventId || `${appUserId}_${eventType}_${Date.now()}`}`;

  try {
    const existingEvent = await PaymentEvent.findOne({ idempotence_id: idempotenceId });
    if (existingEvent) {
      console.log('⏭️ [REVENUECAT] Duplicate event, skipping:', idempotenceId);
      return;
    }
  } catch (err) {
    // If duplicate key error, also skip
    if (err.code === 11000) {
      console.log('⏭️ [REVENUECAT] Duplicate event (index conflict), skipping:', idempotenceId);
      return;
    }
  }

  // Save payment event for audit
  const paymentEvent = new PaymentEvent({
    merchant: mapStore(store),
    external_subscription_id: event.original_transaction_id || event.transaction_id || `rc_${appUserId}`,
    userId: appUserId,
    event_type: eventType,
    event_data: event,
    idempotence_id: idempotenceId,
    processed: false
  });

  try {
    await paymentEvent.save();
  } catch (saveErr) {
    if (saveErr.code === 11000) {
      console.log('⏭️ [REVENUECAT] Duplicate event on save, skipping:', idempotenceId);
      return;
    }
    throw saveErr;
  }

  // Invalidate membership cache for this user
  invalidateCache(appUserId);

  // Update local Subscription record
  const newStatus = mapEventToStatus(eventType);
  if (newStatus) {
    try {
      await Subscription.findOneAndUpdate(
        { userId: appUserId, provider: mapStore(store) },
        {
          userId: appUserId,
          provider: mapStore(store),
          external_subscription_id: event.original_transaction_id || event.transaction_id || `rc_${appUserId}`,
          external_plan_id: productId,
          status: newStatus,
          currentPeriodStart: purchaseDate,
          currentPeriodEnd: expirationDate,
          autoRenewing: eventType !== 'CANCELLATION' && eventType !== 'EXPIRATION'
        },
        { upsert: true, new: true }
      );
      console.log(`✅ [REVENUECAT] Subscription updated: status=${newStatus}`);
    } catch (subErr) {
      console.error('❌ [REVENUECAT] Error updating subscription:', subErr.message);
    }
  }

  // Handle membership for purchase / renewal / promotional events
  if (eventType === 'INITIAL_PURCHASE' || eventType === 'RENEWAL' || eventType === 'NON_RENEWING_PURCHASE') {
    try {
      const startDate = purchaseDate || new Date();
      const endDate = expirationDate || new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000); // fallback 30 days

      // Find or create membership
      const existingMembership = await Membership.findOne({
        userId: appUserId,
        start: {
          $gte: new Date(startDate.getTime() - 60000),
          $lte: new Date(startDate.getTime() + 60000)
        }
      });

      if (!existingMembership) {
        // Try to find matching plan
        const plan = await Plan.findOne({
          $or: [
            { googleplay_product_id: productId },
            { appstore_product_id: productId },
            { external_plan_id: productId }
          ]
        });

        const membership = new Membership({
          userId: appUserId,
          subscriptionId: (await Subscription.findOne({ userId: appUserId }).sort({ updatedAt: -1 }))?._id,
          planId: plan?._id,
          start: startDate,
          end: endDate,
          status: 'active'
        });

        await membership.save();
        console.log(`✅ [REVENUECAT] Membership created: ${startDate.toISOString()} → ${endDate.toISOString()}`);
      } else {
        console.log('⏭️ [REVENUECAT] Membership already exists for this period');
      }
    } catch (memErr) {
      console.error('❌ [REVENUECAT] Error creating membership:', memErr.message);
    }
  }

  // Handle expiration / cancellation
  if (eventType === 'EXPIRATION') {
    try {
      await Membership.updateMany(
        { userId: appUserId, status: { $in: ['purchased', 'active'] } },
        { status: 'expired' }
      );
      console.log('✅ [REVENUECAT] Memberships marked expired');
    } catch (expErr) {
      console.error('❌ [REVENUECAT] Error expiring memberships:', expErr.message);
    }
  }

  if (eventType === 'CANCELLATION') {
    try {
      // Don't expire -- user retains access until period end
      await Subscription.updateOne(
        { userId: appUserId, provider: mapStore(store) },
        { autoRenewing: false }
      );
      console.log('✅ [REVENUECAT] Subscription marked as non-renewing (access until period end)');
    } catch (canErr) {
      console.error('❌ [REVENUECAT] Error handling cancellation:', canErr.message);
    }
  }

  // Mark event as processed
  paymentEvent.processed = true;
  await paymentEvent.save();
  console.log(`✅ [REVENUECAT] Event ${eventType} processed for user ${appUserId}`);
}

module.exports = { handleRevenueCatWebhook };
