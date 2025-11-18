const admin = require('firebase-admin');
const { getUserDeviceTokens } = require('../models/deviceDetail');

// Initialize Firebase Admin SDK (reuse if already initialized)
function getFirebaseApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    throw new Error('Firebase credentials are not configured. Please set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables.');
  }

  try {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        privateKey,
        clientEmail
      })
    });
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    throw new Error(`Failed to initialize Firebase: ${error.message}`);
  }
}

class NotificationService {
  /**
   * Send notification to a single device token
   * @param {string} deviceToken - FCM device token
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} data - Custom data payload (optional)
   * @returns {Promise<object>} FCM send response
   */
  static async sendToToken(deviceToken, title, body, data = {}) {
    try {
      const app = getFirebaseApp();
      const messaging = admin.messaging(app);

      const message = {
        token: deviceToken,
        notification: {
          title,
          body
        },
        data: {
          ...data,
          // Convert all data values to strings (FCM requirement)
          ...Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, String(value)])
          )
        },
        android: {
          priority: 'high'
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      const response = await messaging.send(message);
      console.log('Successfully sent notification:', response);
      return { success: true, messageId: response };
    } catch (error) {
      console.error('Error sending notification:', error);
      if (error.code === 'messaging/invalid-registration-token' || 
          error.code === 'messaging/registration-token-not-registered') {
        // Token is invalid, should be removed from database
        throw new Error('Invalid device token');
      }
      throw new Error(`Failed to send notification: ${error.message}`);
    }
  }

  /**
   * Send notification to a user (all their active devices)
   * @param {string} userId - MongoDB user ID
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} data - Custom data payload (optional)
   * @returns {Promise<object>} Results with success/failure counts
   */
  static async sendToUser(userId, title, body, data = {}) {
    try {
      // Get all active device tokens for the user
      const deviceTokens = await getUserDeviceTokens(userId);

      if (deviceTokens.length === 0) {
        return {
          success: false,
          message: 'No active device tokens found for user',
          sentCount: 0,
          failedCount: 0
        };
      }

      const results = {
        success: true,
        sentCount: 0,
        failedCount: 0,
        failures: []
      };

      // Send to all devices
      for (const token of deviceTokens) {
        try {
          await this.sendToToken(token, title, body, data);
          results.sentCount++;
        } catch (error) {
          results.failedCount++;
          results.failures.push({
            token: token.substring(0, 20) + '...', // Partial token for logging
            error: error.message
          });
          
          // If token is invalid, mark it as inactive
          if (error.message === 'Invalid device token') {
            const { deactivateDeviceDetailByToken } = require('../models/deviceDetail');
            await deactivateDeviceDetailByToken(token);
          }
        }
      }

      return results;
    } catch (error) {
      console.error('Error sending notification to user:', error);
      throw new Error(`Failed to send notification to user: ${error.message}`);
    }
  }

  /**
   * Send notification to multiple tokens
   * @param {string[]} deviceTokens - Array of FCM device tokens
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} data - Custom data payload (optional)
   * @returns {Promise<object>} Results with success/failure counts
   */
  static async sendToMultipleTokens(deviceTokens, title, body, data = {}) {
    const results = {
      success: true,
      sentCount: 0,
      failedCount: 0,
      failures: []
    };

    for (const token of deviceTokens) {
      try {
        await this.sendToToken(token, title, body, data);
        results.sentCount++;
      } catch (error) {
        results.failedCount++;
        results.failures.push({
          token: token.substring(0, 20) + '...',
          error: error.message
        });
      }
    }

    return results;
  }
}

module.exports = NotificationService;

