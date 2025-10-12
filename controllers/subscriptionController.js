const Subscription = require('../models/schemas/Subscription');
const Plan = require('../models/schemas/Plan');
const paymentService = require('../services/paymentService');
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

module.exports = {
  createSubscription,
  getSubscription,
  getActivePlans,
  cancelMembership
};
