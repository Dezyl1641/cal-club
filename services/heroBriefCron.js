const cron = require('node-cron');
const HeroBriefService = require('./heroBriefService');
const Meal = require('../models/schemas/Meal');
const User = require('../models/schemas/User');
const { reportError } = require('../utils/sentryReporter');

/**
 * Get today's date in IST (YYYY-MM-DD).
 */
function getTodayIST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

/**
 * Get yesterday's date in IST (YYYY-MM-DD).
 */
function getYesterdayIST() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/**
 * Find users who were active yesterday (logged at least one meal OR logged in).
 * This avoids wasting Gemini calls on churned users.
 */
async function getActiveUserIds() {
  try {
    const yesterday = getYesterdayIST();
    const startOfYesterday = new Date(yesterday + 'T00:00:00.000+05:30');
    const endOfYesterday = new Date(yesterday + 'T23:59:59.999+05:30');

    // Users who logged meals yesterday
    const usersWithMeals = await Meal.distinct('userId', {
      deletedAt: null,
      capturedAt: { $gte: startOfYesterday, $lte: endOfYesterday }
    });

    // Users who logged in yesterday (catches users who opened the app but didn't log)
    const usersWhoLoggedIn = await User.distinct('_id', {
      isActive: true,
      lastLoginAt: { $gte: startOfYesterday, $lte: endOfYesterday }
    });

    // Merge and deduplicate
    const idSet = new Set([
      ...usersWithMeals.map(String),
      ...usersWhoLoggedIn.map(String)
    ]);

    return Array.from(idSet);
  } catch (error) {
    console.error('[HeroBriefCron] Error fetching active users:', error.message);
    reportError(error, { extra: { context: 'heroBriefCron:getActiveUserIds' } });
    return [];
  }
}

/**
 * Pre-generate hero briefs for a specific phase for all active users.
 */
async function preGenerateBriefs(phase) {
  const today = getTodayIST();
  const userIds = await getActiveUserIds();

  if (userIds.length === 0) {
    console.log(`[HeroBriefCron] No active users found for ${phase} pre-generation`);
    return;
  }

  console.log(`[HeroBriefCron] Pre-generating ${phase} briefs for ${userIds.length} active users`);

  let successCount = 0;
  let errorCount = 0;

  // Process sequentially to avoid overwhelming Gemini API
  for (const userId of userIds) {
    try {
      await HeroBriefService.getOrGenerateBrief(userId, today, phase, false);
      successCount++;
    } catch (error) {
      errorCount++;
      console.error(`[HeroBriefCron] Error generating ${phase} brief for user ${userId}:`, error.message);
      // Don't report every individual failure to Sentry — just log it
    }

    // Small delay between users to be kind to Gemini rate limits
    if (userIds.length > 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`[HeroBriefCron] ${phase} pre-generation complete: ${successCount} success, ${errorCount} errors out of ${userIds.length} users`);
}

/**
 * Initialize the hero brief cron jobs.
 * Runs at each phase boundary in IST:
 *   - 5:00 AM  → Morning Brief
 *   - 12:00 PM → Midday Check-in
 *   - 6:00 PM  → Evening Wrap
 */
function initializeHeroBriefCron() {
  console.log('[HeroBriefCron] Initializing hero brief cron jobs...');

  // Morning Brief — 5:00 AM IST
  cron.schedule('0 5 * * *', async () => {
    console.log('[HeroBriefCron] Running Morning Brief pre-generation...');
    try {
      await preGenerateBriefs('morning');
    } catch (error) {
      reportError(error, { extra: { context: 'heroBriefCron:morning' } });
      console.error('[HeroBriefCron] Fatal error in morning cron:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });

  // Midday Check-in — 12:00 PM IST
  cron.schedule('0 12 * * *', async () => {
    console.log('[HeroBriefCron] Running Midday Check-in pre-generation...');
    try {
      await preGenerateBriefs('midday');
    } catch (error) {
      reportError(error, { extra: { context: 'heroBriefCron:midday' } });
      console.error('[HeroBriefCron] Fatal error in midday cron:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });

  // Evening Wrap — 6:00 PM IST
  cron.schedule('0 18 * * *', async () => {
    console.log('[HeroBriefCron] Running Evening Wrap pre-generation...');
    try {
      await preGenerateBriefs('evening');
    } catch (error) {
      reportError(error, { extra: { context: 'heroBriefCron:evening' } });
      console.error('[HeroBriefCron] Fatal error in evening cron:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });

  console.log('[HeroBriefCron] ✅ Hero brief cron jobs initialized (5:00 AM / 12:00 PM / 6:00 PM IST)');
}

module.exports = { initializeHeroBriefCron, preGenerateBriefs, getActiveUserIds };
