var validator = require('validator');

/*
 * Ensures that the currently authenticated user has a valid email address. If
 * not, redirect to the `/account` route.
 */

// TODO: redirect to the `new-email` route.
module.exports.ensureEmail = function (req, res, next) {
  var accountPath = '/new-email';
  if (
    !req.isAuthenticated() ||
    validator.isEmail(req.user.email_address) ||
    new RegExp(accountPath).test(req.path)
  ) {
    return next();
  }
  res.redirect(accountPath);
};

/*
 * Ensures that either an unauthenticated user, or a user that already has an
 * email address does not try to access a given route.
 */

module.exports.ensureNoEmail = function (req, res, next) {
  if (validator.isEmail(req.user.email_address)) {
    return res.redirect('/account');
  }
  next();
};