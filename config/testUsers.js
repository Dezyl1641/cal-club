/**
 * Env-based test user IDs. Used to:
 * - Route AI food-calories to dual-prompt (V2) flow
 * - Enable recommendation system (widget + cron) only for these users
 *
 * Set in .env: TEST_USER_IDS=id1,id2,id3 (comma-separated, no spaces or with spaces trimmed)
 * Default: 68f08c2ba0498ebc6130f5f9,68f35767a0498ebc6130fa9a
 */
const DEFAULT_TEST_USER_IDS = '68f08c2ba0498ebc6130f5f9,68f35767a0498ebc6130fa9a';

function getTestUserIds() {
  const raw = process.env.TEST_USER_IDS || DEFAULT_TEST_USER_IDS;
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

let cachedSet = null;

function getTestUserIdsSet() {
  if (cachedSet === null) {
    cachedSet = new Set(getTestUserIds());
  }
  return cachedSet;
}

/**
 * @param {string|ObjectId} userId - User ID (string or Mongoose ObjectId)
 * @returns {boolean}
 */
function isTestUser(userId) {
  if (!userId) return false;
  return getTestUserIdsSet().has(String(userId));
}

module.exports = {
  getTestUserIds,
  getTestUserIdsSet,
  isTestUser
};
