const DeviceDetail = require('./schemas/DeviceDetail');

// Create or update device detail (upsert by userId + deviceToken)
async function upsertDeviceDetail(userId, deviceData) {
  const { deviceToken, platform, deviceId, appVersion } = deviceData;
  
  return DeviceDetail.findOneAndUpdate(
    { userId, deviceToken },
    {
      userId,
      deviceToken,
      platform,
      deviceId,
      appVersion,
      isActive: true,
      lastUsedAt: new Date()
    },
    { upsert: true, new: true }
  );
}

// Find device detail by token
async function findDeviceDetailByToken(deviceToken) {
  return DeviceDetail.findOne({ deviceToken, isActive: true });
}

// Find all active device details for a user
async function findActiveDeviceDetailsByUser(userId) {
  return DeviceDetail.find({ userId, isActive: true });
}

// Deactivate device detail by token
async function deactivateDeviceDetailByToken(deviceToken) {
  return DeviceDetail.findOneAndUpdate(
    { deviceToken },
    { isActive: false },
    { new: true }
  );
}

// Delete device detail by token (hard delete)
async function deleteDeviceDetailByToken(deviceToken) {
  return DeviceDetail.deleteOne({ deviceToken });
}

// Get all device tokens for a user (for sending notifications)
async function getUserDeviceTokens(userId) {
  const devices = await DeviceDetail.find({ userId, isActive: true });
  return devices.map(device => device.deviceToken);
}

module.exports = {
  upsertDeviceDetail,
  findDeviceDetailByToken,
  findActiveDeviceDetailsByUser,
  deactivateDeviceDetailByToken,
  deleteDeviceDetailByToken,
  getUserDeviceTokens
};

