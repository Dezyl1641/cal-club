const NotificationPreference = require('./schemas/NotificationPreference');
const mongoose = require('mongoose');

/**
 * Parse meal reminder string and create/update notification preferences
 * Input format: "Morning:08:00 AM:true,Lunch:01:00 PM:false,Dinner:07:00 PM:false"
 * @param {string} userId - User ID
 * @param {string} reminderString - The reminder string from user question
 * @returns {Promise<Array>} Created/updated notification preferences
 */
async function createNotificationPreferencesFromString(userId, reminderString) {
  console.log('📱 [NOTIFICATION_PREF] Processing reminder string for user:', userId);
  console.log('📱 [NOTIFICATION_PREF] Input string:', reminderString);

  if (!reminderString || typeof reminderString !== 'string') {
    console.log('📱 [NOTIFICATION_PREF] Invalid or empty reminder string');
    return [];
  }

  const results = [];
  const entries = reminderString.split(',');

  for (const entry of entries) {
    const parts = entry.trim().split(':');
    
    // Format: "Morning:08:00 AM:true" -> ["Morning", "08", "00 AM", "true"]
    // or could be "Lunch:01:00 PM:false" -> ["Lunch", "01", "00 PM", "false"]
    if (parts.length < 4) {
      console.log('📱 [NOTIFICATION_PREF] Skipping invalid entry:', entry);
      continue;
    }

    const mealLabel = parts[0].trim(); // "Morning", "Lunch", "Dinner"
    const hour = parts[1].trim(); // "08", "01", "07"
    const minuteAndPeriod = parts[2].trim(); // "00 AM", "00 PM"
    const isEnabled = parts[3].trim().toLowerCase() === 'true';

    // Map meal label to type
    const typeMap = {
      'morning': 'BREAKFAST',
      'breakfast': 'BREAKFAST',
      'lunch': 'LUNCH',
      'dinner': 'DINNER',
      'evening': 'DINNER'
    };

    const type = typeMap[mealLabel.toLowerCase()];
    if (!type) {
      console.log('📱 [NOTIFICATION_PREF] Unknown meal type:', mealLabel);
      continue;
    }

    // Parse time
    const [minute, period] = minuteAndPeriod.split(' ');
    const displayTime = `${hour}:${minute} ${period}`;
    
    // Convert to 24-hour format for cron
    let hour24 = parseInt(hour, 10);
    if (period && period.toUpperCase() === 'PM' && hour24 !== 12) {
      hour24 += 12;
    } else if (period && period.toUpperCase() === 'AM' && hour24 === 12) {
      hour24 = 0;
    }
    const time24 = `${hour24.toString().padStart(2, '0')}:${minute}`;

    console.log(`📱 [NOTIFICATION_PREF] Parsed: ${mealLabel} -> Type: ${type}, Time: ${time24}, Display: ${displayTime}, Enabled: ${isEnabled}`);

    // Only create preference if enabled
    if (isEnabled) {
      try {
        const result = await createOrUpdateNotificationPreference(userId, type, time24, displayTime);
        results.push(result);
        console.log(`✅ [NOTIFICATION_PREF] Created/Updated preference: ${type} at ${time24}`);
      } catch (error) {
        console.error(`❌ [NOTIFICATION_PREF] Error creating preference for ${type}:`, error.message);
      }
    } else {
      // If not enabled, deactivate any existing preference for this type
      try {
        await deactivateNotificationPreferenceByType(userId, type);
        console.log(`📱 [NOTIFICATION_PREF] Deactivated preference: ${type} (disabled by user)`);
      } catch (error) {
        console.error(`❌ [NOTIFICATION_PREF] Error deactivating preference for ${type}:`, error.message);
      }
    }
  }

  console.log(`📱 [NOTIFICATION_PREF] Finished processing. Created ${results.length} active preferences.`);
  return results;
}

/**
 * Create or update a notification preference
 * If an active preference for the same type exists, mark it as inactive first
 * @param {string} userId - User ID
 * @param {string} type - BREAKFAST/LUNCH/DINNER
 * @param {string} time - Time in 24-hour format (HH:MM)
 * @param {string} displayTime - Display time (e.g., "08:00 AM")
 * @returns {Promise<Object>} Created notification preference
 */
async function createOrUpdateNotificationPreference(userId, type, time, displayTime) {
  const userIdObj = typeof userId === 'string' 
    ? new mongoose.Types.ObjectId(userId) 
    : userId;

  // Mark any existing active preference for this type as inactive
  const deactivated = await NotificationPreference.updateMany(
    { userId: userIdObj, type, isActive: true },
    { isActive: false }
  );

  if (deactivated.modifiedCount > 0) {
    console.log(`📱 [NOTIFICATION_PREF] Deactivated ${deactivated.modifiedCount} existing ${type} preference(s) for user ${userId}`);
  }

  // Create new active preference
  const preference = new NotificationPreference({
    userId: userIdObj,
    type,
    time,
    displayTime,
    isActive: true
  });

  return await preference.save();
}

/**
 * Deactivate notification preference by type for a user
 * @param {string} userId - User ID
 * @param {string} type - BREAKFAST/LUNCH/DINNER
 * @returns {Promise<Object>} Update result
 */
async function deactivateNotificationPreferenceByType(userId, type) {
  const userIdObj = typeof userId === 'string' 
    ? new mongoose.Types.ObjectId(userId) 
    : userId;

  return await NotificationPreference.updateMany(
    { userId: userIdObj, type, isActive: true },
    { isActive: false }
  );
}

/**
 * Get all active notification preferences for a specific time
 * @param {string} time - Time in 24-hour format (HH:MM)
 * @returns {Promise<Array>} Array of notification preferences
 */
async function getActivePreferencesByTime(time) {
  return await NotificationPreference.find({
    time,
    isActive: true
  }).populate('userId', 'phone name');
}

/**
 * Get all active notification preferences for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of notification preferences
 */
async function getActivePreferencesForUser(userId) {
  const userIdObj = typeof userId === 'string' 
    ? new mongoose.Types.ObjectId(userId) 
    : userId;

  return await NotificationPreference.find({
    userId: userIdObj,
    isActive: true
  });
}

/**
 * Get all notification preferences for a user (including inactive)
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of notification preferences
 */
async function getAllPreferencesForUser(userId) {
  const userIdObj = typeof userId === 'string' 
    ? new mongoose.Types.ObjectId(userId) 
    : userId;

  return await NotificationPreference.find({
    userId: userIdObj
  }).sort({ createdAt: -1 });
}

/**
 * Manually create a notification preference
 * @param {string} userId - User ID
 * @param {string} type - BREAKFAST/LUNCH/DINNER
 * @param {string} time - Time in 24-hour format (HH:MM)
 * @param {string} displayTime - Display time (optional)
 * @returns {Promise<Object>} Created notification preference
 */
async function createManualNotificationPreference(userId, type, time, displayTime = null) {
  // Generate display time if not provided
  if (!displayTime) {
    const [hours, minutes] = time.split(':');
    const hour12 = parseInt(hours) % 12 || 12;
    const period = parseInt(hours) >= 12 ? 'PM' : 'AM';
    displayTime = `${hour12.toString().padStart(2, '0')}:${minutes} ${period}`;
  }

  return await createOrUpdateNotificationPreference(userId, type.toUpperCase(), time, displayTime);
}

module.exports = {
  createNotificationPreferencesFromString,
  createOrUpdateNotificationPreference,
  deactivateNotificationPreferenceByType,
  getActivePreferencesByTime,
  getActivePreferencesForUser,
  getAllPreferencesForUser,
  createManualNotificationPreference
};

