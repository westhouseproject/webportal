/*
 * A middleware used on a route to ensure that the user is authenticated. If
 * not, redirect to the login route.
 */

// TODO: have this route flash an error message.
module.exports.ensureAuthenticated = ensureAuthenticated;
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  req.flash('info', 'You need to be logged in.');
  res.redirect('/');
}

/*
 * A middleware used on a route to ensure that the user is not authenticated. If
 * so, redirect to index route.
 */

// TODO: have this route flash an warning message.
module.exports.ensureUnauthenticated = ensureUnauthenticated;
function ensureUnauthenticated(req, res, next) {
  if (!req.isAuthenticated()) { return next(); }
  req.flash('info', 'You are already logged in.');
  res.redirect('/');
}

/*
 * A middleware used on a route to ensure that the user isn't verified yet.
 */

// TODO: have this route flash a info message.
module.exports.ensureUnverified = ensureUnverified;
function ensureUnverified(req, res, next) {
  if (!req.user || !req.user.isVerified()) { return next(); }
  req.flash('info', 'You are already verified.');
  res.redirect('/');
}

/*
 * A middleware used on a route to ensure that the user is verified.
 */

module.exports.ensureVerified = ensureVerified;
function ensureVerified(req, res, next) {
  if (!req.user || req.user.isVerified()) { return next(); }
  req.flash('error', 'You need to be verified.');
  res.redirect('/');
}

module.exports.onlyAdmin = onlyAdmin;
function onlyAdmin(req, res, next) {
  if (!req.user || req.user.isAdmin) { return next(); }

  const userErrorMessage = 'You need to be an admin to do that.';

  if (req.accepts('json')) {
    return res.json(403, { 'message': userErrorMessage });
  }

  req.flash('error', userErrorMessage);
  res.redirect('/');
}