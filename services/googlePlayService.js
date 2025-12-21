const { google } = require('googleapis');

/**
 * Google Play Developer API Service
 * Handles subscription verification, acknowledgment, and management
 */
class GooglePlayService {
  constructor() {
    this.auth = null;
    this.androidPublisher = null;
    this.packageName = process.env.ANDROID_PACKAGE_NAME;
  }

  /**
   * Initialize Google Auth client
   * Supports both service account key file and JSON credentials in env
   */
  async initializeAuth() {
    if (this.auth) {
      return this.auth;
    }

    const keyFile = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_FILE;
    const credentials = process.env.GOOGLE_PLAY_CREDENTIALS;

    if (!keyFile && !credentials) {
      throw new Error('Google Play credentials not configured. Set GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_PLAY_CREDENTIALS environment variable.');
    }

    if (!this.packageName) {
      throw new Error('ANDROID_PACKAGE_NAME environment variable is not set.');
    }

    try {
      const authConfig = {
        scopes: ['https://www.googleapis.com/auth/androidpublisher']
      };

      if (keyFile) {
        authConfig.keyFile = keyFile;
      } else if (credentials) {
        authConfig.credentials = JSON.parse(credentials);
      }

      this.auth = new google.auth.GoogleAuth(authConfig);
      console.log('✅ [GOOGLE_PLAY] Auth initialized successfully');
      return this.auth;
    } catch (error) {
      console.error('❌ [GOOGLE_PLAY] Failed to initialize auth:', error.message);
      throw new Error(`Failed to initialize Google Play auth: ${error.message}`);
    }
  }

  /**
   * Get Android Publisher API client
   */
  async getAndroidPublisher() {
    if (this.androidPublisher) {
      return this.androidPublisher;
    }

    await this.initializeAuth();
    const authClient = await this.auth.getClient();
    this.androidPublisher = google.androidpublisher({ version: 'v3', auth: authClient });
    return this.androidPublisher;
  }

  /**
   * Verify and get subscription details from Google Play
   * @param {string} productId - The subscription product ID (e.g., 'premium_monthly')
   * @param {string} purchaseToken - The purchase token from the client
   * @returns {Promise<Object>} Subscription purchase details
   */
  async verifySubscription(productId, purchaseToken) {
    console.log(`🔍 [GOOGLE_PLAY] Verifying subscription: ${productId}`);
    
    try {
      const androidPublisher = await this.getAndroidPublisher();
      
      const response = await androidPublisher.purchases.subscriptions.get({
        packageName: this.packageName,
        subscriptionId: productId,
        token: purchaseToken
      });

      console.log('✅ [GOOGLE_PLAY] Subscription verified successfully');
      console.log(`   Order ID: ${response.data.orderId}`);
      console.log(`   Payment State: ${response.data.paymentState}`);
      console.log(`   Acknowledgement State: ${response.data.acknowledgementState}`);
      
      return response.data;
      /*
       * Response contains:
       * - orderId: Unique order ID
       * - startTimeMillis: Subscription start time
       * - expiryTimeMillis: Subscription expiry time
       * - autoRenewing: Whether subscription auto-renews
       * - priceCurrencyCode: Currency code (e.g., 'INR')
       * - priceAmountMicros: Price in micros
       * - countryCode: User's country
       * - paymentState: 0=pending, 1=received, 2=free trial, 3=pending deferred
       * - cancelReason: 0=user cancelled, 1=system cancelled, 2=replaced, 3=developer cancelled
       * - userCancellationTimeMillis: When user cancelled (if applicable)
       * - acknowledgementState: 0=not acknowledged, 1=acknowledged
       */
    } catch (error) {
      console.error('❌ [GOOGLE_PLAY] Subscription verification failed:', error.message);
      
      if (error.code === 410) {
        throw new Error('Purchase token expired or invalid');
      } else if (error.code === 404) {
        throw new Error('Subscription not found');
      }
      
      throw new Error(`Failed to verify subscription: ${error.message}`);
    }
  }

  /**
   * Acknowledge a subscription purchase
   * IMPORTANT: Must be called within 3 days of purchase or it will be refunded
   * @param {string} productId - The subscription product ID
   * @param {string} purchaseToken - The purchase token
   */
  async acknowledgeSubscription(productId, purchaseToken) {
    console.log(`📝 [GOOGLE_PLAY] Acknowledging subscription: ${productId}`);
    
    try {
      const androidPublisher = await this.getAndroidPublisher();
      
      await androidPublisher.purchases.subscriptions.acknowledge({
        packageName: this.packageName,
        subscriptionId: productId,
        token: purchaseToken
      });

      console.log('✅ [GOOGLE_PLAY] Subscription acknowledged successfully');
      return true;
    } catch (error) {
      console.error('❌ [GOOGLE_PLAY] Failed to acknowledge subscription:', error.message);
      throw new Error(`Failed to acknowledge subscription: ${error.message}`);
    }
  }

  /**
   * Cancel a subscription
   * @param {string} productId - The subscription product ID
   * @param {string} purchaseToken - The purchase token
   */
  async cancelSubscription(productId, purchaseToken) {
    console.log(`🚫 [GOOGLE_PLAY] Cancelling subscription: ${productId}`);
    
    try {
      const androidPublisher = await this.getAndroidPublisher();
      
      await androidPublisher.purchases.subscriptions.cancel({
        packageName: this.packageName,
        subscriptionId: productId,
        token: purchaseToken
      });

      console.log('✅ [GOOGLE_PLAY] Subscription cancelled successfully');
      return true;
    } catch (error) {
      console.error('❌ [GOOGLE_PLAY] Failed to cancel subscription:', error.message);
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  /**
   * Revoke a subscription (immediate cancellation)
   * @param {string} productId - The subscription product ID
   * @param {string} purchaseToken - The purchase token
   */
  async revokeSubscription(productId, purchaseToken) {
    console.log(`⛔ [GOOGLE_PLAY] Revoking subscription: ${productId}`);
    
    try {
      const androidPublisher = await this.getAndroidPublisher();
      
      await androidPublisher.purchases.subscriptions.revoke({
        packageName: this.packageName,
        subscriptionId: productId,
        token: purchaseToken
      });

      console.log('✅ [GOOGLE_PLAY] Subscription revoked successfully');
      return true;
    } catch (error) {
      console.error('❌ [GOOGLE_PLAY] Failed to revoke subscription:', error.message);
      throw new Error(`Failed to revoke subscription: ${error.message}`);
    }
  }

  /**
   * Defer a subscription's billing cycle
   * @param {string} productId - The subscription product ID
   * @param {string} purchaseToken - The purchase token
   * @param {number} expectedExpiryTimeMillis - Current expiry time
   * @param {number} desiredExpiryTimeMillis - New desired expiry time
   */
  async deferSubscription(productId, purchaseToken, expectedExpiryTimeMillis, desiredExpiryTimeMillis) {
    console.log(`⏰ [GOOGLE_PLAY] Deferring subscription: ${productId}`);
    
    try {
      const androidPublisher = await this.getAndroidPublisher();
      
      const response = await androidPublisher.purchases.subscriptions.defer({
        packageName: this.packageName,
        subscriptionId: productId,
        token: purchaseToken,
        requestBody: {
          deferralInfo: {
            expectedExpiryTimeMillis: expectedExpiryTimeMillis.toString(),
            desiredExpiryTimeMillis: desiredExpiryTimeMillis.toString()
          }
        }
      });

      console.log('✅ [GOOGLE_PLAY] Subscription deferred successfully');
      console.log(`   New expiry: ${new Date(parseInt(response.data.newExpiryTimeMillis))}`);
      
      return response.data;
    } catch (error) {
      console.error('❌ [GOOGLE_PLAY] Failed to defer subscription:', error.message);
      throw new Error(`Failed to defer subscription: ${error.message}`);
    }
  }

  /**
   * Map Google Play subscription state to internal status
   * @param {Object} purchaseData - Purchase data from Google Play API
   * @returns {string} Internal subscription status
   */
  static mapSubscriptionStatus(purchaseData) {
    const { paymentState, cancelReason, expiryTimeMillis, autoRenewing } = purchaseData;
    const now = Date.now();
    const isExpired = parseInt(expiryTimeMillis) < now;

    // Check if cancelled
    if (cancelReason !== undefined && cancelReason !== null) {
      if (isExpired) {
        return 'expired';
      }
      return 'cancelled'; // Cancelled but still active until expiry
    }

    // Check expiry
    if (isExpired) {
      return 'expired';
    }

    // Check payment state
    switch (paymentState) {
      case 0: // Payment pending
        return 'on_hold';
      case 1: // Payment received
        return 'active';
      case 2: // Free trial
        return 'active';
      case 3: // Pending deferred upgrade/downgrade
        return 'active';
      default:
        return autoRenewing ? 'active' : 'cancelled';
    }
  }
}

// Export singleton instance
module.exports = new GooglePlayService();

// Also export class for testing
module.exports.GooglePlayService = GooglePlayService;


