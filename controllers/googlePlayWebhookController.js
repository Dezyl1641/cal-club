const PaymentEvent = require('../models/schemas/PaymentEvent');
const Subscription = require('../models/schemas/Subscription');
const Membership = require('../models/schemas/Membership');
const Plan = require('../models/schemas/Plan');
const googlePlayService = require('../services/googlePlayService');
const parseBody = require('../utils/parseBody');

/**
 * Google Play Real-Time Developer Notification (RTDN) Types
 * https://developer.android.com/google/play/billing/rtdn-reference
 */
const NOTIFICATION_TYPES = {
  1: 'SUBSCRIPTION_RECOVERED',      // Subscription was recovered from account hold
  2: 'SUBSCRIPTION_RENEWED',        // Subscription was renewed
  3: 'SUBSCRIPTION_CANCELED',       // Subscription was cancelled (either voluntarily or involuntarily)
  4: 'SUBSCRIPTION_PURCHASED',      // New subscription was purchased
  5: 'SUBSCRIPTION_ON_HOLD',        // Subscription has entered account hold
  6: 'SUBSCRIPTION_IN_GRACE_PERIOD', // Subscription entered grace period
  7: 'SUBSCRIPTION_RESTARTED',      // User restarted their subscription
  8: 'SUBSCRIPTION_PRICE_CHANGE_CONFIRMED', // Price change was confirmed
  9: 'SUBSCRIPTION_DEFERRED',       // Subscription's recurrence time was extended
  10: 'SUBSCRIPTION_PAUSED',        // Subscription was paused
  11: 'SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED', // Subscription pause schedule was changed
  12: 'SUBSCRIPTION_REVOKED',       // Subscription was revoked
  13: 'SUBSCRIPTION_EXPIRED'        // Subscription expired
};

/**
 * Map notification type to subscription status
 */
const NOTIFICATION_STATUS_MAP = {
  1: 'active',           // SUBSCRIPTION_RECOVERED
  2: 'active',           // SUBSCRIPTION_RENEWED
  3: 'cancelled',        // SUBSCRIPTION_CANCELED
  4: 'active',           // SUBSCRIPTION_PURCHASED
  5: 'on_hold',          // SUBSCRIPTION_ON_HOLD
  6: 'in_grace_period',  // SUBSCRIPTION_IN_GRACE_PERIOD
  7: 'active',           // SUBSCRIPTION_RESTARTED
  10: 'paused',          // SUBSCRIPTION_PAUSED
  12: 'cancelled',       // SUBSCRIPTION_REVOKED
  13: 'expired'          // SUBSCRIPTION_EXPIRED
};

/**
 * Handle Google Play Real-Time Developer Notification (RTDN)
 * Google sends notifications via Cloud Pub/Sub
 * 
 * POST /webhook/google-play
 */
async function handleGooglePlayWebhook(req, res) {
  console.log('=== GOOGLE PLAY RTDN RECEIVED ===');
  console.log('Timestamp:', new Date().toISOString());

  let body = null;
  let decodedMessage = null;

  try {
    body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    if (!body) {
      console.error('❌ [GOOGLE_PLAY_WEBHOOK] Missing body');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing request body' }));
      return;
    }

    // Google Cloud Pub/Sub message format
    // body.message.data is base64-encoded
    if (!body.message || !body.message.data) {
      console.error('❌ [GOOGLE_PLAY_WEBHOOK] Invalid Pub/Sub message format');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid Pub/Sub message format' }));
      return;
    }

    // Decode the base64 message
    const messageData = Buffer.from(body.message.data, 'base64').toString('utf8');
    decodedMessage = JSON.parse(messageData);

    console.log('📦 [GOOGLE_PLAY_WEBHOOK] Decoded message:', JSON.stringify(decodedMessage, null, 2));

    const { subscriptionNotification, packageName, eventTimeMillis } = decodedMessage;

    if (!subscriptionNotification) {
      // Could be a test notification or one-time purchase notification
      console.log('ℹ️ [GOOGLE_PLAY_WEBHOOK] Not a subscription notification, acknowledging');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Not a subscription notification' }));
      return;
    }

    const { notificationType, purchaseToken, subscriptionId } = subscriptionNotification;
    const notificationTypeName = NOTIFICATION_TYPES[notificationType] || `UNKNOWN_${notificationType}`;

    console.log(`🔔 [GOOGLE_PLAY_WEBHOOK] Notification Type: ${notificationTypeName} (${notificationType})`);
    console.log(`   Package: ${packageName}`);
    console.log(`   Product ID: ${subscriptionId}`);
    console.log(`   Purchase Token: ${purchaseToken?.substring(0, 30)}...`);

    // Generate idempotence key
    const idempotenceId = `gp_${notificationType}_${purchaseToken?.substring(0, 50)}_${eventTimeMillis}`;

    // Check for duplicate events
    const existingEvent = await PaymentEvent.findOne({ idempotence_id: idempotenceId });
    if (existingEvent) {
      console.log('⚠️ [GOOGLE_PLAY_WEBHOOK] Duplicate event detected:', idempotenceId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Event already processed' }));
      return;
    }

    // Find existing subscription by purchase token
    let subscription = await Subscription.findOne({
      provider: 'GOOGLE_PLAY',
      external_subscription_id: purchaseToken
    });

    // For new purchases, subscription might not exist yet
    if (!subscription && notificationType === 4) { // SUBSCRIPTION_PURCHASED
      console.log('📝 [GOOGLE_PLAY_WEBHOOK] New subscription purchase detected');
      // The subscription should be created via the verify API called by the app
      // Just log and acknowledge - the app will call verify endpoint
      
      // Create a payment event to track this notification
      const paymentEvent = new PaymentEvent({
        merchant: 'GOOGLE_PLAY',
        external_subscription_id: purchaseToken,
        userId: null, // Unknown at this point
        event_type: notificationTypeName,
        event_data: decodedMessage,
        idempotence_id: idempotenceId,
        processed: true,
        processing_error: 'Subscription not found - awaiting app verification'
      });
      await paymentEvent.save();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        message: 'New purchase notification received, awaiting app verification' 
      }));
      return;
    }

    if (!subscription) {
      console.error('❌ [GOOGLE_PLAY_WEBHOOK] Subscription not found for token');
      
      // Still acknowledge to prevent retries, but log as error
      const paymentEvent = new PaymentEvent({
        merchant: 'GOOGLE_PLAY',
        external_subscription_id: purchaseToken,
        userId: null,
        event_type: notificationTypeName,
        event_data: decodedMessage,
        idempotence_id: idempotenceId,
        processed: true,
        processing_error: 'Subscription not found in database'
      });
      await paymentEvent.save();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Subscription not found, event logged' }));
      return;
    }

    console.log('✅ [GOOGLE_PLAY_WEBHOOK] Found subscription:', subscription._id);
    console.log('   User ID:', subscription.userId);
    console.log('   Current Status:', subscription.status);

    // Create payment event record
    const paymentEvent = new PaymentEvent({
      merchant: 'GOOGLE_PLAY',
      external_subscription_id: purchaseToken,
      userId: subscription.userId,
      event_type: notificationTypeName,
      event_data: decodedMessage,
      idempotence_id: idempotenceId,
      processed: false
    });
    await paymentEvent.save();

    // Verify current state with Google Play API
    let purchaseData;
    try {
      purchaseData = await googlePlayService.verifySubscription(subscriptionId, purchaseToken);
    } catch (error) {
      console.error('❌ [GOOGLE_PLAY_WEBHOOK] Failed to verify with Google:', error.message);
      paymentEvent.processing_error = error.message;
      paymentEvent.processed = true;
      await paymentEvent.save();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Verification failed, event logged' }));
      return;
    }

    // Update subscription status
    const newStatus = NOTIFICATION_STATUS_MAP[notificationType];
    const oldStatus = subscription.status;

    if (newStatus && newStatus !== subscription.status) {
      subscription.status = newStatus;
      console.log(`🔄 [GOOGLE_PLAY_WEBHOOK] Status update: ${oldStatus} → ${newStatus}`);
    }

    // Update subscription period from Google Play data
    if (purchaseData.startTimeMillis) {
      subscription.currentPeriodStart = new Date(parseInt(purchaseData.startTimeMillis));
    }
    if (purchaseData.expiryTimeMillis) {
      subscription.currentPeriodEnd = new Date(parseInt(purchaseData.expiryTimeMillis));
    }
    if (purchaseData.autoRenewing !== undefined) {
      subscription.autoRenewing = purchaseData.autoRenewing;
    }
    if (purchaseData.orderId && !subscription.external_order_id) {
      subscription.external_order_id = purchaseData.orderId;
    }

    await subscription.save();

    // Update membership if renewed
    if (notificationType === 2) { // SUBSCRIPTION_RENEWED
      await updateMembershipOnRenewal(subscription, purchaseData);
    }
    // Note: We don't change membership status on cancellation or expiration
    // Access is determined by checking membership.end > currentDate
    // For CANCELED (3) and REVOKED (12): subscription cancelled, but membership
    //   remains 'purchased' until end date
    // For EXPIRED (13): subscription expired, but membership end date already
    //   indicates expiry - no status change needed

    // Mark event as processed
    paymentEvent.processed = true;
    await paymentEvent.save();

    console.log('✅ [GOOGLE_PLAY_WEBHOOK] Webhook processed successfully');
    console.log('   Event:', notificationTypeName);
    console.log('   Subscription:', subscription._id);
    console.log('   New Status:', subscription.status);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Webhook processed successfully',
      notificationType: notificationTypeName,
      subscriptionId: subscription._id
    }));

  } catch (error) {
    console.error('❌ [GOOGLE_PLAY_WEBHOOK] Processing error:', error.message);
    console.error('Stack:', error.stack);

    // Always respond with 200 to prevent Pub/Sub retries for processing errors
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: false, 
      message: 'Error processing webhook',
      error: error.message 
    }));
  }
}

/**
 * Create new membership when subscription is renewed
 * Each renewal creates a new membership record for that billing cycle
 */
async function updateMembershipOnRenewal(subscription, purchaseData) {
  try {
    // Find the plan for this subscription
    const plan = await Plan.findOne({ 
      $or: [
        { googleplay_product_id: subscription.external_plan_id },
        { external_plan_id: subscription.external_plan_id }
      ]
    });

    if (!plan) {
      console.error('❌ [GOOGLE_PLAY_WEBHOOK] Plan not found for renewal:', subscription.external_plan_id);
      return;
    }

    // Calculate new period dates from Google Play data
    const startDate = new Date(parseInt(purchaseData.startTimeMillis));
    const endDate = new Date(parseInt(purchaseData.expiryTimeMillis));
    // Round end date to EOD
    endDate.setHours(23, 59, 59, 999);

    // Check if membership for this exact period already exists (idempotency)
    const existingMembership = await Membership.findOne({
      subscriptionId: subscription._id,
      start: startDate
    });

    if (existingMembership) {
      console.log('⚠️ [GOOGLE_PLAY_WEBHOOK] Membership for this period already exists:', existingMembership._id);
      return;
    }

    // Create new membership for the renewed period
    const newMembership = new Membership({
      userId: subscription.userId,
      subscriptionId: subscription._id,
      planId: plan._id,
      start: startDate,
      end: endDate,
      status: 'purchased'
    });

    await newMembership.save();
    console.log('✅ [GOOGLE_PLAY_WEBHOOK] New membership created for renewal');
    console.log('   Membership ID:', newMembership._id);
    console.log('   Period:', startDate.toISOString(), '→', endDate.toISOString());
  } catch (error) {
    console.error('❌ [GOOGLE_PLAY_WEBHOOK] Failed to create renewal membership:', error.message);
  }
}

module.exports = {
  handleGooglePlayWebhook,
  NOTIFICATION_TYPES,
  NOTIFICATION_STATUS_MAP
};

