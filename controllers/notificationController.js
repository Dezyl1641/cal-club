const parseBody = require('../utils/parseBody');
const {
  upsertDeviceDetail,
  deactivateDeviceDetailByToken,
  deleteDeviceDetailByToken
} = require('../models/deviceDetail');
const NotificationService = require('../services/notificationService');
const {
  createManualNotificationPreference,
  getActivePreferencesForUser,
  getAllPreferencesForUser,
  deactivateNotificationPreferenceByType
} = require('../models/notificationPreference');
const { sendTestReminder, getCurrentTimeIST } = require('../services/scheduledNotificationService');

async function registerToken(req, res) {
  try {
    const body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const userId = req.user?.userId;
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Validate required fields
    if (!body.deviceToken || !body.platform) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Invalid request. deviceToken and platform are required.',
        required: ['deviceToken', 'platform'],
        optional: ['deviceId', 'appVersion']
      }));
      return;
    }

    // Validate platform
    if (!['ios', 'android', 'web'].includes(body.platform)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Invalid platform. Must be one of: ios, android, web'
      }));
      return;
    }

    // Upsert device detail
    const deviceDetail = await upsertDeviceDetail(userId, {
      deviceToken: body.deviceToken,
      platform: body.platform,
      deviceId: body.deviceId || null,
      appVersion: body.appVersion || null
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Device token registered successfully',
      deviceDetail: {
        deviceToken: deviceDetail.deviceToken,
        platform: deviceDetail.platform,
        deviceId: deviceDetail.deviceId,
        appVersion: deviceDetail.appVersion
      }
    }));
  } catch (error) {
    console.error('Error registering device token:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to register device token',
      details: error.message
    }));
  }
}

async function deregisterToken(req, res) {
  try {
    const body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const userId = req.user?.userId;
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    if (!body.deviceToken) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Invalid request. deviceToken is required.'
      }));
      return;
    }

    // Deactivate the device token
    const result = await deactivateDeviceDetailByToken(body.deviceToken);

    if (!result) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Device token not found'
      }));
      return;
    }

    // Verify the token belongs to the authenticated user
    if (result.userId.toString() !== userId.toString()) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Forbidden. This device token does not belong to you.'
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Device token deregistered successfully'
    }));
  } catch (error) {
    console.error('Error deregistering device token:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to deregister device token',
      details: error.message
    }));
  }
}

async function sendNotification(req, res) {
  try {
    const body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const userId = req.user?.userId;
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Validate required fields
    if (!body.title || !body.body) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Invalid request. title and body are required.',
        required: ['title', 'body'],
        optional: ['data']
      }));
      return;
    }

    // Send notification to user
    const result = await NotificationService.sendToUser(
      userId,
      body.title,
      body.body,
      body.data || {}
    );

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: result.success,
      message: result.message || 'Notification sent',
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      failures: result.failures || []
    }));
  } catch (error) {
    console.error('Error sending notification:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to send notification',
      details: error.message
    }));
  }
}

/**
 * Create a notification preference manually
 * POST /notifications/preferences
 */
async function createPreference(req, res) {
  try {
    const body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const userId = req.user?.userId;
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Validate required fields
    if (!body.type || !body.time) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Invalid request. type and time are required.',
        required: ['type', 'time'],
        optional: ['displayTime'],
        typeValues: ['BREAKFAST', 'LUNCH', 'DINNER'],
        timeFormat: 'HH:MM (24-hour format, e.g., 08:00, 13:00, 19:00)'
      }));
      return;
    }

    // Validate type
    const validTypes = ['BREAKFAST', 'LUNCH', 'DINNER'];
    if (!validTypes.includes(body.type.toUpperCase())) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: `Invalid type. Must be one of: ${validTypes.join(', ')}`
      }));
      return;
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(body.time)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Invalid time format. Must be HH:MM in 24-hour format (e.g., 08:00, 13:00, 19:00)'
      }));
      return;
    }

    console.log(`📱 [NOTIFICATION_PREF_API] Creating preference for user: ${userId}`);
    console.log(`📱 [NOTIFICATION_PREF_API] Type: ${body.type.toUpperCase()}, Time: ${body.time}`);

    const preference = await createManualNotificationPreference(
      userId, 
      body.type.toUpperCase(), 
      body.time, 
      body.displayTime
    );

    console.log(`✅ [NOTIFICATION_PREF_API] Preference created:`, preference._id);

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Notification preference created successfully',
      preference: {
        id: preference._id,
        type: preference.type,
        time: preference.time,
        displayTime: preference.displayTime,
        isActive: preference.isActive,
        createdAt: preference.createdAt
      },
      info: {
        currentTimeIST: getCurrentTimeIST(),
        nextTrigger: `Notification will be sent at ${preference.time} IST`
      }
    }));
  } catch (error) {
    console.error('❌ [NOTIFICATION_PREF_API] Error creating preference:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to create notification preference',
      details: error.message
    }));
  }
}

/**
 * Get all notification preferences for the authenticated user
 * GET /notifications/preferences
 */
async function getPreferences(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Check if query param includeInactive is set
    const url = new URL(req.url, `http://${req.headers.host}`);
    const includeInactive = url.searchParams.get('includeInactive') === 'true';

    let preferences;
    if (includeInactive) {
      preferences = await getAllPreferencesForUser(userId);
    } else {
      preferences = await getActivePreferencesForUser(userId);
    }

    console.log(`📱 [NOTIFICATION_PREF_API] Found ${preferences.length} preferences for user: ${userId}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: preferences.length,
      preferences: preferences.map(p => ({
        id: p._id,
        type: p.type,
        time: p.time,
        displayTime: p.displayTime,
        isActive: p.isActive,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      })),
      currentTimeIST: getCurrentTimeIST()
    }));
  } catch (error) {
    console.error('❌ [NOTIFICATION_PREF_API] Error fetching preferences:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to fetch notification preferences',
      details: error.message
    }));
  }
}

/**
 * Deactivate a notification preference by type
 * DELETE /notifications/preferences/:type
 */
async function deletePreference(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Extract type from URL path
    const urlParts = req.url.split('/');
    const type = urlParts[urlParts.length - 1].split('?')[0].toUpperCase();

    const validTypes = ['BREAKFAST', 'LUNCH', 'DINNER'];
    if (!validTypes.includes(type)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: `Invalid type. Must be one of: ${validTypes.join(', ')}`
      }));
      return;
    }

    console.log(`📱 [NOTIFICATION_PREF_API] Deactivating ${type} preference for user: ${userId}`);

    const result = await deactivateNotificationPreferenceByType(userId, type);

    if (result.modifiedCount === 0) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: `No active ${type} preference found`
      }));
      return;
    }

    console.log(`✅ [NOTIFICATION_PREF_API] Deactivated ${result.modifiedCount} ${type} preference(s)`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: `${type} notification preference deactivated`,
      deactivatedCount: result.modifiedCount
    }));
  } catch (error) {
    console.error('❌ [NOTIFICATION_PREF_API] Error deactivating preference:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to deactivate notification preference',
      details: error.message
    }));
  }
}

/**
 * Send a test meal reminder notification
 * POST /notifications/test-reminder
 */
async function testReminder(req, res) {
  try {
    const body = await new Promise((resolve, reject) => {
      parseBody(req, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const userId = req.user?.userId;
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Validate type
    const validTypes = ['BREAKFAST', 'LUNCH', 'DINNER'];
    const type = (body.type || 'BREAKFAST').toUpperCase();
    if (!validTypes.includes(type)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: `Invalid type. Must be one of: ${validTypes.join(', ')}`
      }));
      return;
    }

    console.log(`🧪 [NOTIFICATION_PREF_API] Sending test ${type} reminder to user: ${userId}`);

    const result = await sendTestReminder(userId, type);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: result.success,
      message: result.message || 'Test notification sent',
      type,
      sentCount: result.sentCount || 0,
      failedCount: result.failedCount || 0,
      currentTimeIST: getCurrentTimeIST()
    }));
  } catch (error) {
    console.error('❌ [NOTIFICATION_PREF_API] Error sending test reminder:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to send test reminder',
      details: error.message
    }));
  }
}

module.exports = {
  registerToken,
  deregisterToken,
  sendNotification,
  createPreference,
  getPreferences,
  deletePreference,
  testReminder
};

