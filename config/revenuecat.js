/**
 * RevenueCat configuration.
 *
 * Set these in your .env:
 *   REVENUECAT_API_KEY=sk_xxxxxxxx        (V1 secret API key from RC dashboard)
 *   REVENUECAT_WEBHOOK_AUTH=your_secret    (auth header value configured in RC webhook settings)
 */

const REVENUECAT_API_KEY = process.env.REVENUECAT_API_KEY || '';
const REVENUECAT_WEBHOOK_AUTH = process.env.REVENUECAT_WEBHOOK_AUTH || '';
const REVENUECAT_BASE_URL = 'https://api.revenuecat.com/v1';
const PREMIUM_ENTITLEMENT_ID = 'premium';

module.exports = {
  REVENUECAT_API_KEY,
  REVENUECAT_WEBHOOK_AUTH,
  REVENUECAT_BASE_URL,
  PREMIUM_ENTITLEMENT_ID
};
