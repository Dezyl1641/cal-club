const https = require('https');
const crypto = require('crypto');

/**
 * Apple App Store Service
 * Handles receipt validation, subscription verification, and App Store Server API
 * 
 * Documentation:
 * - Receipt Validation: https://developer.apple.com/documentation/appstorereceipts
 * - App Store Server API: https://developer.apple.com/documentation/appstoreserverapi
 * - Server Notifications V2: https://developer.apple.com/documentation/appstoreservernotifications
 */
class AppleStoreService {
  constructor() {
    this.bundleId = process.env.APPLE_BUNDLE_ID;
    this.sharedSecret = process.env.APPLE_SHARED_SECRET;
    this.issuerId = process.env.APPLE_ISSUER_ID;
    this.keyId = process.env.APPLE_KEY_ID;
    this.privateKey = process.env.APPLE_PRIVATE_KEY;
    
    // Environment URLs
    this.productionVerifyUrl = 'https://buy.itunes.apple.com/verifyReceipt';
    this.sandboxVerifyUrl = 'https://sandbox.itunes.apple.com/verifyReceipt';
    
    // App Store Server API URLs
    this.productionApiUrl = 'https://api.storekit.itunes.apple.com';
    this.sandboxApiUrl = 'https://api.storekit-sandbox.itunes.apple.com';
  }

  /**
   * Verify receipt with Apple's verifyReceipt endpoint
   * Automatically handles sandbox fallback (status 21007)
   * 
   * @param {string} receiptData - Base64 encoded receipt data
   * @param {boolean} isSandbox - Force sandbox environment
   * @returns {Promise<Object>} Receipt validation response
   */
  async verifyReceipt(receiptData, isSandbox = false) {
    console.log('🍎 [APPLE] Verifying receipt...');
    
    if (!this.sharedSecret) {
      throw new Error('APPLE_SHARED_SECRET environment variable is not set');
    }

    const requestBody = JSON.stringify({
      'receipt-data': receiptData,
      'password': this.sharedSecret,
      'exclude-old-transactions': true
    });

    const verifyUrl = isSandbox ? this.sandboxVerifyUrl : this.productionVerifyUrl;
    
    try {
      const response = await this.makeHttpsRequest(verifyUrl, requestBody);
      
      // Status 21007 means receipt is from sandbox - retry with sandbox URL
      if (response.status === 21007 && !isSandbox) {
        console.log('🍎 [APPLE] Receipt is from sandbox, retrying...');
        return this.verifyReceipt(receiptData, true);
      }
      
      // Status 0 means valid receipt
      if (response.status !== 0) {
        const errorMessage = this.getReceiptErrorMessage(response.status);
        console.error(`❌ [APPLE] Receipt validation failed: ${errorMessage}`);
        throw new Error(errorMessage);
      }
      
      console.log('✅ [APPLE] Receipt verified successfully');
      return {
        ...response,
        environment: isSandbox ? 'Sandbox' : 'Production'
      };
    } catch (error) {
      console.error('❌ [APPLE] Receipt verification error:', error.message);
      throw error;
    }
  }

  /**
   * Extract subscription info from verified receipt
   * @param {Object} receiptResponse - Response from verifyReceipt
   * @param {string} productId - The product ID to look for
   * @returns {Object|null} Latest subscription info
   */
  extractSubscriptionInfo(receiptResponse, productId = null) {
    const latestReceiptInfo = receiptResponse.latest_receipt_info || [];
    const pendingRenewalInfo = receiptResponse.pending_renewal_info || [];
    
    if (latestReceiptInfo.length === 0) {
      return null;
    }

    // Find the latest transaction for the specified product (or any if not specified)
    let latestTransaction = latestReceiptInfo[0];
    
    if (productId) {
      const filtered = latestReceiptInfo.filter(t => t.product_id === productId);
      if (filtered.length > 0) {
        latestTransaction = filtered.reduce((latest, current) => {
          return parseInt(current.purchase_date_ms) > parseInt(latest.purchase_date_ms) 
            ? current 
            : latest;
        });
      }
    } else {
      // Get the most recent transaction
      latestTransaction = latestReceiptInfo.reduce((latest, current) => {
        return parseInt(current.purchase_date_ms) > parseInt(latest.purchase_date_ms) 
          ? current 
          : latest;
      });
    }

    // Find pending renewal info for this subscription
    const renewalInfo = pendingRenewalInfo.find(
      r => r.product_id === latestTransaction.product_id
    ) || {};

    const expiresDateMs = parseInt(latestTransaction.expires_date_ms || '0');
    const isExpired = expiresDateMs < Date.now();
    const isInTrial = latestTransaction.is_trial_period === 'true';
    const isInIntroOffer = latestTransaction.is_in_intro_offer_period === 'true';

    return {
      originalTransactionId: latestTransaction.original_transaction_id,
      transactionId: latestTransaction.transaction_id,
      productId: latestTransaction.product_id,
      purchaseDate: new Date(parseInt(latestTransaction.purchase_date_ms)),
      expiresDate: new Date(expiresDateMs),
      originalPurchaseDate: new Date(parseInt(latestTransaction.original_purchase_date_ms)),
      isExpired,
      isInTrial,
      isInIntroOffer,
      autoRenewStatus: renewalInfo.auto_renew_status === '1',
      autoRenewProductId: renewalInfo.auto_renew_product_id,
      expirationIntent: renewalInfo.expiration_intent,
      gracePeriodExpiresDate: renewalInfo.grace_period_expires_date_ms 
        ? new Date(parseInt(renewalInfo.grace_period_expires_date_ms))
        : null,
      webOrderLineItemId: latestTransaction.web_order_line_item_id,
      subscriptionGroupIdentifier: latestTransaction.subscription_group_identifier
    };
  }

  /**
   * Map Apple subscription state to internal status
   * @param {Object} subscriptionInfo - Extracted subscription info
   * @returns {string} Internal subscription status
   */
  static mapSubscriptionStatus(subscriptionInfo) {
    if (!subscriptionInfo) {
      return 'expired';
    }

    const { isExpired, autoRenewStatus, expirationIntent, gracePeriodExpiresDate } = subscriptionInfo;

    // Check if in grace period
    if (gracePeriodExpiresDate && gracePeriodExpiresDate > new Date()) {
      return 'in_grace_period';
    }

    // Check if expired
    if (isExpired) {
      return 'expired';
    }

    // Check cancellation intent
    if (expirationIntent) {
      switch (expirationIntent) {
        case '1': // Customer cancelled
          return autoRenewStatus ? 'active' : 'cancelled';
        case '2': // Billing error
          return 'on_hold';
        case '3': // Customer didn't consent to price increase
          return 'cancelled';
        case '4': // Product not available at renewal
          return 'cancelled';
        default:
          break;
      }
    }

    // Active subscription
    return 'active';
  }

  /**
   * Verify App Store Server Notification V2 (JWS)
   * @param {string} signedPayload - JWS signed payload from Apple
   * @returns {Promise<Object>} Decoded and verified notification
   */
  async verifyServerNotification(signedPayload) {
    console.log('🍎 [APPLE] Verifying server notification...');
    
    try {
      // Decode JWS (header.payload.signature)
      const parts = signedPayload.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWS format');
      }

      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      
      // In production, you should verify the signature using Apple's public key
      // The x5c header contains the certificate chain
      // For now, we'll decode and return the payload
      // TODO: Implement full JWS signature verification
      
      console.log('✅ [APPLE] Notification decoded successfully');
      console.log('   Notification Type:', payload.notificationType);
      console.log('   Subtype:', payload.subtype || 'N/A');
      
      return {
        header,
        payload,
        notificationType: payload.notificationType,
        subtype: payload.subtype,
        data: payload.data,
        signedDate: payload.signedDate ? new Date(payload.signedDate) : null
      };
    } catch (error) {
      console.error('❌ [APPLE] Failed to verify notification:', error.message);
      throw new Error(`Invalid server notification: ${error.message}`);
    }
  }

  /**
   * Decode signed transaction info from notification
   * @param {string} signedTransactionInfo - JWS signed transaction
   * @returns {Object} Decoded transaction info
   */
  decodeSignedTransaction(signedTransactionInfo) {
    try {
      const parts = signedTransactionInfo.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWS format for transaction');
      }
      
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return payload;
    } catch (error) {
      console.error('❌ [APPLE] Failed to decode signed transaction:', error.message);
      throw error;
    }
  }

  /**
   * Decode signed renewal info from notification
   * @param {string} signedRenewalInfo - JWS signed renewal info
   * @returns {Object} Decoded renewal info
   */
  decodeSignedRenewalInfo(signedRenewalInfo) {
    try {
      const parts = signedRenewalInfo.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWS format for renewal info');
      }
      
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return payload;
    } catch (error) {
      console.error('❌ [APPLE] Failed to decode signed renewal info:', error.message);
      throw error;
    }
  }

  /**
   * Generate JWT for App Store Server API
   * @returns {string} JWT token
   */
  generateApiToken() {
    if (!this.issuerId || !this.keyId || !this.privateKey) {
      throw new Error('Apple API credentials not configured (APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY)');
    }

    const header = {
      alg: 'ES256',
      kid: this.keyId,
      typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.issuerId,
      iat: now,
      exp: now + 3600, // 1 hour expiry
      aud: 'appstoreconnect-v1',
      bid: this.bundleId
    };

    // Create JWT (simplified - in production use a proper JWT library)
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    
    const sign = crypto.createSign('SHA256');
    sign.update(`${headerB64}.${payloadB64}`);
    const signature = sign.sign(this.privateKey, 'base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  /**
   * Get subscription status from App Store Server API
   * @param {string} originalTransactionId - Original transaction ID
   * @param {boolean} isSandbox - Use sandbox environment
   * @returns {Promise<Object>} Subscription status
   */
  async getSubscriptionStatus(originalTransactionId, isSandbox = false) {
    console.log(`🍎 [APPLE] Getting subscription status for: ${originalTransactionId}`);
    
    const baseUrl = isSandbox ? this.sandboxApiUrl : this.productionApiUrl;
    const url = `${baseUrl}/inApps/v1/subscriptions/${originalTransactionId}`;
    
    try {
      const token = this.generateApiToken();
      const response = await this.makeHttpsRequest(url, null, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ [APPLE] Subscription status retrieved');
      return response;
    } catch (error) {
      // Try sandbox if production fails with 404
      if (!isSandbox && error.statusCode === 404) {
        console.log('🍎 [APPLE] Trying sandbox environment...');
        return this.getSubscriptionStatus(originalTransactionId, true);
      }
      
      console.error('❌ [APPLE] Failed to get subscription status:', error.message);
      throw error;
    }
  }

  /**
   * Get transaction history from App Store Server API
   * @param {string} originalTransactionId - Original transaction ID
   * @param {boolean} isSandbox - Use sandbox environment
   * @returns {Promise<Object>} Transaction history
   */
  async getTransactionHistory(originalTransactionId, isSandbox = false) {
    console.log(`🍎 [APPLE] Getting transaction history for: ${originalTransactionId}`);
    
    const baseUrl = isSandbox ? this.sandboxApiUrl : this.productionApiUrl;
    const url = `${baseUrl}/inApps/v1/history/${originalTransactionId}`;
    
    try {
      const token = this.generateApiToken();
      const response = await this.makeHttpsRequest(url, null, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ [APPLE] Transaction history retrieved');
      return response;
    } catch (error) {
      if (!isSandbox && error.statusCode === 404) {
        return this.getTransactionHistory(originalTransactionId, true);
      }
      
      console.error('❌ [APPLE] Failed to get transaction history:', error.message);
      throw error;
    }
  }

  /**
   * Make HTTPS request
   * @param {string} url - Request URL
   * @param {string|null} body - Request body (for POST)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response data
   */
  makeHttpsRequest(url, body = null, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: options.method || (body ? 'POST' : 'GET'),
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      };

      if (body) {
        requestOptions.headers['Content-Length'] = Buffer.byteLength(body);
      }

      const req = https.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', chunk => data += chunk);
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              const error = new Error(parsed.errorMessage || `HTTP ${res.statusCode}`);
              error.statusCode = res.statusCode;
              error.response = parsed;
              reject(error);
            } else {
              resolve(parsed);
            }
          } catch (e) {
            if (res.statusCode >= 400) {
              const error = new Error(`HTTP ${res.statusCode}: ${data}`);
              error.statusCode = res.statusCode;
              reject(error);
            } else {
              resolve(data);
            }
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(body);
      }
      
      req.end();
    });
  }

  /**
   * Get human-readable error message for receipt status codes
   * @param {number} status - Receipt status code
   * @returns {string} Error message
   */
  getReceiptErrorMessage(status) {
    const errorMessages = {
      21000: 'The App Store could not read the JSON object you provided.',
      21002: 'The data in the receipt-data property was malformed or missing.',
      21003: 'The receipt could not be authenticated.',
      21004: 'The shared secret you provided does not match the shared secret on file for your account.',
      21005: 'The receipt server is not currently available.',
      21006: 'This receipt is valid but the subscription has expired.',
      21007: 'This receipt is from the test environment (sandbox).',
      21008: 'This receipt is from the production environment.',
      21009: 'Internal data access error.',
      21010: 'The user account cannot be found or has been deleted.',
      21100: 'Internal data access error (21100-21199).',
    };

    // Handle 21100-21199 range
    if (status >= 21100 && status <= 21199) {
      return errorMessages[21100];
    }

    return errorMessages[status] || `Unknown error (status: ${status})`;
  }
}

// Export singleton instance
module.exports = new AppleStoreService();

// Also export class for testing
module.exports.AppleStoreService = AppleStoreService;

