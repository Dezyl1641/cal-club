const Subscription = require('../models/schemas/Subscription');
const Plan = require('../models/schemas/Plan');
const Membership = require('../models/schemas/Membership');
const paymentService = require('../services/paymentService');
const googlePlayService = require('../services/googlePlayService');
const { GooglePlayService } = require('../services/googlePlayService');
const parseBody = require('../utils/parseBody');

async function createSubscription(req, res) {
  try {
    const body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    const { external_plan_id } = body;
    const userId = req.user.userId;

    if (!external_plan_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'external_plan_id is required' }));
      return;
    }

    // Create subscription in Razorpay with 7-day trial
    const razorpaySubscription = await paymentService.createSubscription(
      external_plan_id, // Use the external_plan_id from request
      null, // No customer ID for now
      {
        totalCount: 1,
        quantity: 1,
        customerNotify: true,
        trialDays: 7, // 7-day trial period
        trialAmount: 0 // Free trial
      }
    );

    // Log the Razorpay subscription response
    console.log('Razorpay subscription created:', JSON.stringify(razorpaySubscription, null, 2));

    // Save subscription to database
    const subscription = new Subscription({
      userId: userId,
      provider: 'RAZORPAY',
      external_subscription_id: razorpaySubscription.id,
      external_plan_id: external_plan_id,
      status: razorpaySubscription.status
    });

    await subscription.save();

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Subscription created successfully',
      external_subscription_id: subscription.external_subscription_id,
      subscription: {
        id: subscription._id,
        external_subscription_id: subscription.external_subscription_id,
        external_plan_id: subscription.external_plan_id,
        status: subscription.status,
        razorpay_subscription: razorpaySubscription
      }
    }));

  } catch (error) {
    console.error('Error creating subscription:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to create subscription',
      details: error.message 
    }));
  }
}

async function getSubscription(req, res) {
  try {
    const userId = req.user.userId;
    
    const subscription = await Subscription.findOne({ userId })
      .sort({ createdAt: -1 });

    if (!subscription) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No subscription found' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      subscription: subscription
    }));

  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to fetch subscription',
      details: error.message 
    }));
  }
}

async function getActivePlans(req, res) {
  try {
    const plans = await Plan.find({ isActive: true })
      .sort({ createdAt: -1 });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      plans: plans,
      count: plans.length
    }));

  } catch (error) {
    console.error('Error fetching active plans:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to fetch active plans',
      details: error.message 
    }));
  }
}

async function cancelMembership(req, res) {
  try {
    const body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const { membershipId } = body;
    const userId = req.user.userId;

    if (!membershipId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'membershipId is required' }));
      return;
    }

    // Find and update membership
    const membership = await Membership.findOneAndUpdate(
      { _id: membershipId, userId: userId },
      { status: 'cancelled' },
      { new: true }
    );

    if (!membership) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Membership not found or access denied' }));
      return;
    }

    // Also cancel the associated subscription in Razorpay and database
    const subscription = await Subscription.findOne({
      _id: membership.subscriptionId,
      userId: userId
    });

    if (subscription && subscription.external_subscription_id) {
      try {
        // Cancel subscription in Razorpay
        await paymentService.cancelSubscription(subscription.external_subscription_id);
        console.log('✅ Razorpay subscription cancelled:', subscription.external_subscription_id);
      } catch (error) {
        console.error('❌ Error cancelling Razorpay subscription:', error);
        // Continue with database update even if Razorpay cancellation fails
      }
    }

    // Update subscription status in database
    await Subscription.findOneAndUpdate(
      { _id: membership.subscriptionId, userId: userId },
      { status: 'cancelled' }
    );

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Membership cancelled successfully',
      membership: {
        id: membership._id,
        status: membership.status,
        start: membership.start,
        end: membership.end,
        cancelledAt: new Date()
      }
    }));

  } catch (error) {
    console.error('Error cancelling membership:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to cancel membership',
      details: error.message 
    }));
  }
}

async function getSubscriptionById(req, res) {
  try {
    const subscriptionId = req.url.split('/')[2]; // Extract ID from URL
    const userId = req.user.userId;

    if (!subscriptionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Subscription ID is required' }));
      return;
    }

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      userId: userId
    });

    if (!subscription) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Subscription not found or access denied' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      subscription: {
        id: subscription._id,
        external_subscription_id: subscription.external_subscription_id,
        external_plan_id: subscription.external_plan_id,
        status: subscription.status,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt
      }
    }));

  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to fetch subscription',
      details: error.message 
    }));
  }
}

/**
 * Verify and link a Google Play subscription purchase
 * Called by the Android app after a successful purchase
 * 
 * POST /subscriptions/google-play/verify
 * Body: { productId: string, purchaseToken: string }
 */
async function verifyGooglePlayPurchase(req, res) {
  try {
    const body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const { productId, purchaseToken } = body;
    const userId = req.user.userId;

    console.log('🔍 [GOOGLE_PLAY_VERIFY] Verifying purchase');
    console.log('   User ID:', userId);
    console.log('   Product ID:', productId);
    console.log('   Purchase Token:', purchaseToken?.substring(0, 30) + '...');

    // Validate required fields
    if (!productId || !purchaseToken) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'productId and purchaseToken are required' 
      }));
      return;
    }

    // Check if subscription already exists (idempotency)
    const existingSubscription = await Subscription.findOne({
      provider: 'GOOGLE_PLAY',
      external_subscription_id: purchaseToken
    });

    if (existingSubscription) {
      console.log('⚠️ [GOOGLE_PLAY_VERIFY] Subscription already exists:', existingSubscription._id);
      
      // Verify the subscription still belongs to this user
      if (existingSubscription.userId.toString() !== userId) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Purchase token already linked to another user' 
        }));
        return;
      }

      // Return existing subscription
      const membership = await Membership.findOne({ 
        subscriptionId: existingSubscription._id 
      }).sort({ createdAt: -1 });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Subscription already verified',
        subscription: {
          id: existingSubscription._id,
          provider: existingSubscription.provider,
          external_subscription_id: existingSubscription.external_subscription_id,
          external_order_id: existingSubscription.external_order_id,
          status: existingSubscription.status,
          currentPeriodStart: existingSubscription.currentPeriodStart,
          currentPeriodEnd: existingSubscription.currentPeriodEnd,
          autoRenewing: existingSubscription.autoRenewing
        },
        membership: membership ? {
          id: membership._id,
          start: membership.start,
          end: membership.end,
          status: membership.status
        } : null
      }));
      return;
    }

    // Verify purchase with Google Play API
    let purchaseData;
    try {
      purchaseData = await googlePlayService.verifySubscription(productId, purchaseToken);
    } catch (error) {
      console.error('❌ [GOOGLE_PLAY_VERIFY] Verification failed:', error.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Purchase verification failed',
        details: error.message 
      }));
      return;
    }

    console.log('✅ [GOOGLE_PLAY_VERIFY] Purchase verified with Google');
    console.log('   Order ID:', purchaseData.orderId);
    console.log('   Payment State:', purchaseData.paymentState);
    console.log('   Expiry:', new Date(parseInt(purchaseData.expiryTimeMillis)));

    // Find the plan by Google Play product ID
    let plan = await Plan.findOne({ googleplay_product_id: productId, isActive: true });
    
    if (!plan) {
      // Fallback: try to find by external_plan_id (if same ID used)
      plan = await Plan.findOne({ external_plan_id: productId, isActive: true });
    }

    if (!plan) {
      console.error('❌ [GOOGLE_PLAY_VERIFY] No plan found for product:', productId);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'No matching plan found for this product',
        productId: productId 
      }));
      return;
    }

    console.log('✅ [GOOGLE_PLAY_VERIFY] Found matching plan:', plan.title);

    // Map Google Play status
    const status = GooglePlayService.mapSubscriptionStatus(purchaseData);

    // Create subscription record
    const subscription = new Subscription({
      userId: userId,
      provider: 'GOOGLE_PLAY',
      external_subscription_id: purchaseToken,
      external_plan_id: productId,
      external_order_id: purchaseData.orderId,
      status: status,
      currentPeriodStart: new Date(parseInt(purchaseData.startTimeMillis)),
      currentPeriodEnd: new Date(parseInt(purchaseData.expiryTimeMillis)),
      autoRenewing: purchaseData.autoRenewing || false,
      acknowledged: purchaseData.acknowledgementState === 1
    });

    await subscription.save();
    console.log('✅ [GOOGLE_PLAY_VERIFY] Subscription created:', subscription._id);

    // Create membership
    const startDate = new Date(parseInt(purchaseData.startTimeMillis));
    const endDate = new Date(parseInt(purchaseData.expiryTimeMillis));
    // Round end date to EOD
    endDate.setHours(23, 59, 59, 999);

    const membership = new Membership({
      userId: userId,
      subscriptionId: subscription._id,
      planId: plan._id,
      start: startDate,
      end: endDate,
      status: 'purchased'
    });

    await membership.save();
    console.log('✅ [GOOGLE_PLAY_VERIFY] Membership created:', membership._id);

    // Acknowledge purchase if not already acknowledged (CRITICAL!)
    if (purchaseData.acknowledgementState !== 1) {
      try {
        await googlePlayService.acknowledgeSubscription(productId, purchaseToken);
        subscription.acknowledged = true;
        await subscription.save();
        console.log('✅ [GOOGLE_PLAY_VERIFY] Purchase acknowledged');
      } catch (ackError) {
        console.error('⚠️ [GOOGLE_PLAY_VERIFY] Failed to acknowledge:', ackError.message);
        // Don't fail the request, but log for retry
      }
    }

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Google Play purchase verified and subscription created',
      subscription: {
        id: subscription._id,
        provider: subscription.provider,
        external_subscription_id: subscription.external_subscription_id,
        external_order_id: subscription.external_order_id,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        autoRenewing: subscription.autoRenewing,
        acknowledged: subscription.acknowledged
      },
      membership: {
        id: membership._id,
        planId: plan._id,
        planTitle: plan.title,
        start: membership.start,
        end: membership.end,
        status: membership.status
      }
    }));

  } catch (error) {
    console.error('❌ [GOOGLE_PLAY_VERIFY] Error:', error.message);
    console.error('Stack:', error.stack);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to verify Google Play purchase',
      details: error.message 
    }));
  }
}

/**
 * Get subscription status from Google Play
 * Useful for checking current state without modifying local data
 * 
 * POST /subscriptions/google-play/status
 * Body: { productId: string, purchaseToken: string }
 */
async function getGooglePlaySubscriptionStatus(req, res) {
  try {
    const body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const { productId, purchaseToken } = body;

    if (!productId || !purchaseToken) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'productId and purchaseToken are required' 
      }));
      return;
    }

    const purchaseData = await googlePlayService.verifySubscription(productId, purchaseToken);
    const status = GooglePlayService.mapSubscriptionStatus(purchaseData);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      googlePlayData: {
        orderId: purchaseData.orderId,
        startTime: new Date(parseInt(purchaseData.startTimeMillis)),
        expiryTime: new Date(parseInt(purchaseData.expiryTimeMillis)),
        autoRenewing: purchaseData.autoRenewing,
        paymentState: purchaseData.paymentState,
        cancelReason: purchaseData.cancelReason,
        acknowledged: purchaseData.acknowledgementState === 1
      },
      mappedStatus: status
    }));

  } catch (error) {
    console.error('Error getting Google Play status:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Failed to get Google Play subscription status',
      details: error.message 
    }));
  }
}

module.exports = {
  createSubscription,
  getSubscription,
  getSubscriptionById,
  getActivePlans,
  cancelMembership,
  verifyGooglePlayPurchase,
  getGooglePlaySubscriptionStatus
};
