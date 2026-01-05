const PaymentEvent = require('../models/schemas/PaymentEvent');
const Subscription = require('../models/schemas/Subscription');
const Membership = require('../models/schemas/Membership');
const Plan = require('../models/schemas/Plan');
const appleStoreService = require('../services/appleStoreService');
const { AppleStoreService } = require('../services/appleStoreService');
const parseBody = require('../utils/parseBody');

/**
 * App Store Server Notification V2 Types
 * https://developer.apple.com/documentation/appstoreservernotifications/notificationtype
 */
const NOTIFICATION_TYPES = {
  CONSUMPTION_REQUEST: 'CONSUMPTION_REQUEST',
  DID_CHANGE_RENEWAL_PREF: 'DID_CHANGE_RENEWAL_PREF',
  DID_CHANGE_RENEWAL_STATUS: 'DID_CHANGE_RENEWAL_STATUS',
  DID_FAIL_TO_RENEW: 'DID_FAIL_TO_RENEW',
  DID_RENEW: 'DID_RENEW',
  EXPIRED: 'EXPIRED',
  GRACE_PERIOD_EXPIRED: 'GRACE_PERIOD_EXPIRED',
  OFFER_REDEEMED: 'OFFER_REDEEMED',
  PRICE_INCREASE: 'PRICE_INCREASE',
  REFUND: 'REFUND',
  REFUND_DECLINED: 'REFUND_DECLINED',
  REFUND_REVERSED: 'REFUND_REVERSED',
  RENEWAL_EXTENDED: 'RENEWAL_EXTENDED',
  RENEWAL_EXTENSION: 'RENEWAL_EXTENSION',
  REVOKE: 'REVOKE',
  SUBSCRIBED: 'SUBSCRIBED',
  TEST: 'TEST'
};

/**
 * Notification subtypes
 */
const NOTIFICATION_SUBTYPES = {
  INITIAL_BUY: 'INITIAL_BUY',
  RESUBSCRIBE: 'RESUBSCRIBE',
  DOWNGRADE: 'DOWNGRADE',
  UPGRADE: 'UPGRADE',
  AUTO_RENEW_ENABLED: 'AUTO_RENEW_ENABLED',
  AUTO_RENEW_DISABLED: 'AUTO_RENEW_DISABLED',
  VOLUNTARY: 'VOLUNTARY',
  BILLING_RETRY: 'BILLING_RETRY',
  PRICE_INCREASE: 'PRICE_INCREASE',
  GRACE_PERIOD: 'GRACE_PERIOD',
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  BILLING_RECOVERY: 'BILLING_RECOVERY',
  PRODUCT_NOT_FOR_SALE: 'PRODUCT_NOT_FOR_SALE',
  SUMMARY: 'SUMMARY',
  FAILURE: 'FAILURE'
};

/**
 * Map notification type to subscription status
 */
const NOTIFICATION_STATUS_MAP = {
  [NOTIFICATION_TYPES.SUBSCRIBED]: 'active',
  [NOTIFICATION_TYPES.DID_RENEW]: 'active',
  [NOTIFICATION_TYPES.DID_FAIL_TO_RENEW]: 'on_hold',
  [NOTIFICATION_TYPES.GRACE_PERIOD_EXPIRED]: 'on_hold',
  [NOTIFICATION_TYPES.EXPIRED]: 'expired',
  [NOTIFICATION_TYPES.REFUND]: 'cancelled',
  [NOTIFICATION_TYPES.REVOKE]: 'cancelled'
};

/**
 * Handle App Store Server Notification V2
 * Apple sends notifications as JWS (JSON Web Signature) signed payloads
 * 
 * POST /webhooks/apple
 */
async function handleAppleWebhook(req, res) {
  console.log('=== APPLE APP STORE NOTIFICATION RECEIVED ===');
  console.log('Timestamp:', new Date().toISOString());

  let body = null;
  let decodedNotification = null;

  try {
    body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    if (!body) {
      console.error('❌ [APPLE_WEBHOOK] Missing body');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing request body' }));
      return;
    }

    // Apple sends the signed payload in the signedPayload field
    const { signedPayload } = body;
    
    if (!signedPayload) {
      console.error('❌ [APPLE_WEBHOOK] Missing signedPayload');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing signedPayload' }));
      return;
    }

    // Verify and decode the notification
    decodedNotification = await appleStoreService.verifyServerNotification(signedPayload);
    
    const { notificationType, subtype, data } = decodedNotification;
    
    console.log(`🔔 [APPLE_WEBHOOK] Notification Type: ${notificationType}`);
    console.log(`   Subtype: ${subtype || 'N/A'}`);

    // Handle test notifications
    if (notificationType === NOTIFICATION_TYPES.TEST) {
      console.log('✅ [APPLE_WEBHOOK] Test notification received');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Test notification acknowledged' }));
      return;
    }

    // Decode transaction and renewal info from the data
    let transactionInfo = null;
    let renewalInfo = null;

    if (data?.signedTransactionInfo) {
      transactionInfo = appleStoreService.decodeSignedTransaction(data.signedTransactionInfo);
      console.log('   Original Transaction ID:', transactionInfo.originalTransactionId);
      console.log('   Product ID:', transactionInfo.productId);
    }

    if (data?.signedRenewalInfo) {
      renewalInfo = appleStoreService.decodeSignedRenewalInfo(data.signedRenewalInfo);
      console.log('   Auto Renew Status:', renewalInfo.autoRenewStatus);
    }

    if (!transactionInfo) {
      console.error('❌ [APPLE_WEBHOOK] No transaction info in notification');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'No transaction info' }));
      return;
    }

    const originalTransactionId = transactionInfo.originalTransactionId;
    const productId = transactionInfo.productId;

    // Generate idempotence key
    const idempotenceId = `apple_${notificationType}_${originalTransactionId}_${transactionInfo.transactionId}`;

    // Check for duplicate events
    const existingEvent = await PaymentEvent.findOne({ idempotence_id: idempotenceId });
    if (existingEvent) {
      console.log('⚠️ [APPLE_WEBHOOK] Duplicate event detected:', idempotenceId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Event already processed' }));
      return;
    }

    // Find existing subscription by original transaction ID
    let subscription = await Subscription.findOne({
      provider: 'APPLE',
      external_subscription_id: originalTransactionId
    });

    // For new subscriptions (SUBSCRIBED), the subscription might not exist yet
    if (!subscription && notificationType === NOTIFICATION_TYPES.SUBSCRIBED) {
      console.log('📝 [APPLE_WEBHOOK] New subscription detected');
      
      // Create a payment event to track this notification
      const paymentEvent = new PaymentEvent({
        merchant: 'APPLE',
        external_subscription_id: originalTransactionId,
        userId: null, // Unknown at this point
        event_type: `${notificationType}${subtype ? '_' + subtype : ''}`,
        event_data: {
          notificationType,
          subtype,
          transactionInfo,
          renewalInfo
        },
        idempotence_id: idempotenceId,
        processed: true,
        processing_error: 'Subscription not found - awaiting app verification'
      });
      await paymentEvent.save();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        message: 'New subscription notification received, awaiting app verification' 
      }));
      return;
    }

    if (!subscription) {
      console.error('❌ [APPLE_WEBHOOK] Subscription not found for:', originalTransactionId);
      
      // Still acknowledge to prevent retries
      const paymentEvent = new PaymentEvent({
        merchant: 'APPLE',
        external_subscription_id: originalTransactionId,
        userId: null,
        event_type: `${notificationType}${subtype ? '_' + subtype : ''}`,
        event_data: {
          notificationType,
          subtype,
          transactionInfo,
          renewalInfo
        },
        idempotence_id: idempotenceId,
        processed: true,
        processing_error: 'Subscription not found in database'
      });
      await paymentEvent.save();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Subscription not found, event logged' }));
      return;
    }

    console.log('✅ [APPLE_WEBHOOK] Found subscription:', subscription._id);
    console.log('   User ID:', subscription.userId);
    console.log('   Current Status:', subscription.status);

    // Create payment event record
    const paymentEvent = new PaymentEvent({
      merchant: 'APPLE',
      external_subscription_id: originalTransactionId,
      userId: subscription.userId,
      event_type: `${notificationType}${subtype ? '_' + subtype : ''}`,
      event_data: {
        notificationType,
        subtype,
        transactionInfo,
        renewalInfo
      },
      idempotence_id: idempotenceId,
      processed: false
    });
    await paymentEvent.save();

    // Update subscription status
    const oldStatus = subscription.status;
    const newStatus = NOTIFICATION_STATUS_MAP[notificationType];

    if (newStatus && newStatus !== subscription.status) {
      subscription.status = newStatus;
      console.log(`🔄 [APPLE_WEBHOOK] Status update: ${oldStatus} → ${newStatus}`);
    }

    // Update subscription period from transaction info
    if (transactionInfo.purchaseDate) {
      subscription.currentPeriodStart = new Date(transactionInfo.purchaseDate);
    }
    if (transactionInfo.expiresDate) {
      subscription.currentPeriodEnd = new Date(transactionInfo.expiresDate);
    }
    if (renewalInfo) {
      subscription.autoRenewing = renewalInfo.autoRenewStatus === 1;
    }

    await subscription.save();

    // Handle specific notification types
    switch (notificationType) {
      case NOTIFICATION_TYPES.DID_RENEW:
        await handleRenewal(subscription, transactionInfo);
        break;
        
      case NOTIFICATION_TYPES.DID_CHANGE_RENEWAL_STATUS:
        // Auto-renew status changed - already updated above
        console.log('📝 [APPLE_WEBHOOK] Auto-renew status changed:', 
          renewalInfo?.autoRenewStatus === 1 ? 'enabled' : 'disabled');
        break;
        
      case NOTIFICATION_TYPES.REFUND:
        await handleRefund(subscription, transactionInfo);
        break;
        
      case NOTIFICATION_TYPES.REVOKE:
        await handleRevoke(subscription, transactionInfo);
        break;
        
      default:
        console.log(`ℹ️ [APPLE_WEBHOOK] Notification ${notificationType} processed (no special handling)`);
    }

    // Mark event as processed
    paymentEvent.processed = true;
    await paymentEvent.save();

    console.log('✅ [APPLE_WEBHOOK] Webhook processed successfully');
    console.log('   Event:', notificationType);
    console.log('   Subscription:', subscription._id);
    console.log('   New Status:', subscription.status);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Webhook processed successfully',
      notificationType,
      subscriptionId: subscription._id
    }));

  } catch (error) {
    console.error('❌ [APPLE_WEBHOOK] Processing error:', error.message);
    console.error('Stack:', error.stack);

    // Always respond with 200 to prevent Apple retries for processing errors
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: false, 
      message: 'Error processing webhook',
      error: error.message 
    }));
  }
}

/**
 * Handle subscription renewal
 * Creates new membership for the renewed period
 */
async function handleRenewal(subscription, transactionInfo) {
  try {
    // Find the plan for this subscription
    const plan = await Plan.findOne({ 
      $or: [
        { appstore_product_id: transactionInfo.productId },
        { external_plan_id: transactionInfo.productId }
      ]
    });

    if (!plan) {
      console.error('❌ [APPLE_WEBHOOK] Plan not found for renewal:', transactionInfo.productId);
      return;
    }

    // Calculate period dates
    const startDate = new Date(transactionInfo.purchaseDate);
    const endDate = new Date(transactionInfo.expiresDate);
    // Round end date to EOD
    endDate.setHours(23, 59, 59, 999);

    // Check if membership for this exact period already exists (idempotency)
    const existingMembership = await Membership.findOne({
      subscriptionId: subscription._id,
      start: startDate
    });

    if (existingMembership) {
      console.log('⚠️ [APPLE_WEBHOOK] Membership for this period already exists:', existingMembership._id);
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
    console.log('✅ [APPLE_WEBHOOK] New membership created for renewal');
    console.log('   Membership ID:', newMembership._id);
    console.log('   Period:', startDate.toISOString(), '→', endDate.toISOString());
  } catch (error) {
    console.error('❌ [APPLE_WEBHOOK] Failed to create renewal membership:', error.message);
  }
}

/**
 * Handle refund notification
 */
async function handleRefund(subscription, transactionInfo) {
  console.log('💸 [APPLE_WEBHOOK] Processing refund for subscription:', subscription._id);
  
  try {
    // Update subscription status
    subscription.status = 'cancelled';
    await subscription.save();

    // Optionally update membership status
    // Note: You might want to keep membership active until original end date
    // or revoke access immediately depending on your business rules
    
    console.log('✅ [APPLE_WEBHOOK] Refund processed');
  } catch (error) {
    console.error('❌ [APPLE_WEBHOOK] Failed to process refund:', error.message);
  }
}

/**
 * Handle revoke notification (Family Sharing revocation)
 */
async function handleRevoke(subscription, transactionInfo) {
  console.log('🚫 [APPLE_WEBHOOK] Processing revocation for subscription:', subscription._id);
  
  try {
    // Update subscription status
    subscription.status = 'cancelled';
    subscription.autoRenewing = false;
    await subscription.save();

    // Update current membership to cancelled
    await Membership.findOneAndUpdate(
      { 
        subscriptionId: subscription._id,
        status: 'purchased'
      },
      { status: 'cancelled' }
    );
    
    console.log('✅ [APPLE_WEBHOOK] Revocation processed');
  } catch (error) {
    console.error('❌ [APPLE_WEBHOOK] Failed to process revocation:', error.message);
  }
}

module.exports = {
  handleAppleWebhook,
  NOTIFICATION_TYPES,
  NOTIFICATION_SUBTYPES,
  NOTIFICATION_STATUS_MAP
};

