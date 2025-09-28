const Razorpay = require('razorpay');

class PaymentService {
  constructor() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    
    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
  }

  async createSubscription(planId, customerId, options = {}) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const trialDays = options.trialDays || 7;
      const trialEndTime = now + (trialDays * 24 * 60 * 60); // 7 days from now
      
      const subscriptionData = {
        plan_id: planId,
        total_count: options.totalCount || 1,
        quantity: options.quantity || 1,
        customer_notify: options.customerNotify !== undefined ? options.customerNotify : true,
        start_at: trialEndTime, // Start charging after trial period
        expire_by: now + (30 * 24 * 60 * 60) // 30 days from now
      };

      if (customerId) {
        subscriptionData.customer_id = customerId;
      }

      const subscription = await this.razorpay.subscriptions.create(subscriptionData);
      return subscription;
    } catch (error) {
      console.error('Error creating Razorpay subscription:', error);
      throw new Error(`Failed to create subscription: ${error.error?.description || error.message}`);
    }
  }

  async getSubscription(subscriptionId) {
    try {
      const subscription = await this.razorpay.subscriptions.fetch(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('Error fetching Razorpay subscription:', error);
      throw new Error(`Failed to fetch subscription: ${error.message}`);
    }
  }

  async cancelSubscription(subscriptionId) {
    try {
      const subscription = await this.razorpay.subscriptions.cancel(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('Error cancelling Razorpay subscription:', error);
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }
}

module.exports = new PaymentService();
