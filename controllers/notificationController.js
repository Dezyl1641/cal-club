const parseBody = require('../utils/parseBody');
const {
  upsertDeviceDetail,
  deactivateDeviceDetailByToken,
  deleteDeviceDetailByToken
} = require('../models/deviceDetail');
const NotificationService = require('../services/notificationService');

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

module.exports = {
  registerToken,
  deregisterToken,
  sendNotification
};

