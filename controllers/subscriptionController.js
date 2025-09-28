const ExternalSubscription = require('../models/schemas/ExternalSubscription');
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
    const externalSubscription = new ExternalSubscription({
      userId: userId,
      external_subscription_id: razorpaySubscription.id,
      external_plan_id: external_plan_id,
      status: razorpaySubscription.status
    });

    await externalSubscription.save();

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Subscription created successfully',
      external_subscription_id: externalSubscription.external_subscription_id,
      subscription: {
        id: externalSubscription._id,
        external_subscription_id: externalSubscription.external_subscription_id,
        external_plan_id: externalSubscription.external_plan_id,
        status: externalSubscription.status,
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
    
    const subscription = await ExternalSubscription.findOne({ userId })
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

module.exports = {
  createSubscription,
  getSubscription
};
