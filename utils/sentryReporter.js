const Sentry = require('@sentry/node');

/**
 * Report an error to Sentry. Use in catch blocks so every thrown error is tracked.
 * @param {Error} err - The error to report
 * @param {Object} [context] - Optional context
 * @param {Object} [context.req] - Express-like request (url, method, user)
 */
function reportError(err, context = {}) {
  if (!err) return;
  Sentry.withScope((scope) => {
    if (context.req) {
      scope.setTag('url', context.req.url?.split('?')[0]);
      scope.setTag('method', context.req.method);
      if (context.req.user?.userId) {
        scope.setUser({ id: context.req.user.userId });
      }
    }
    if (context.extra) {
      Object.entries(context.extra).forEach(([key, value]) => scope.setExtra(key, value));
    }
    Sentry.captureException(err);
  });
}

module.exports = { reportError };
