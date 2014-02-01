var validator = require('validator');

/*
 * Ensures that the currently authenticated user has a valid email address. If
 * not, redirect to the `/account` route.
 */

module.exports.ensureEmail = function (req, res, next) {
  var accountPath = '/account';
  if (
    !req.isAuthenticated() ||
    validator.isEmail(req.user.email_address) ||
    new RegExp(accountPath).test(req.path)
  ) {
    return next();
  }
  res.redirect(accountPath);
}