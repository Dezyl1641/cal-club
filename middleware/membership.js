/**
 * Membership middleware.
 *
 * attachMembershipStatus  - attaches req.user.membership (non-blocking).
 * requireAccess           - blocks request with 403 if user has no access.
 */

const { checkMembership } = require('../utils/membershipCheck');

const MEMBERSHIP_ENFORCEMENT_ENABLED =
  (process.env.MEMBERSHIP_ENFORCEMENT_ENABLED || 'false').toLowerCase() === 'true';

/**
 * Attach membership status to req.user without blocking.
 * Call this globally after JWT middleware so every handler
 * can read req.user.membership.
 */
async function attachMembershipStatus(req, res, next) {
  // Skip if no authenticated user
  if (!req.user || !req.user.userId) {
    return next();
  }

  try {
    const membership = await checkMembership(req.user.userId);
    req.user.membership = membership;
  } catch (error) {
    // Don't block the request if membership check fails
    console.error('⚠️ [MEMBERSHIP] Failed to attach status:', error.message);
    req.user.membership = {
      hasAccess: false,
      isPremium: false,
      isInTrial: false,
      expiresDate: null,
      productIdentifier: null
    };
  }

  next();
}

/**
 * Block request if user does not have active access (trial or paid).
 * Returns 403 with upgradeRequired flag so the client can show the paywall.
 * When MEMBERSHIP_ENFORCEMENT_ENABLED is false, this becomes a no-op.
 */
function requireAccess(req, res, next) {
  if (!MEMBERSHIP_ENFORCEMENT_ENABLED) {
    return next();
  }

  const membership = req.user?.membership;

  if (membership && membership.hasAccess) {
    return next();
  }

  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Premium subscription required',
    upgradeRequired: true,
    message: 'Subscribe to access this feature'
  }));
}

module.exports = {
  attachMembershipStatus,
  requireAccess
};
