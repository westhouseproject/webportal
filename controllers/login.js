var route = require('./middlewares');
var passport = require('passport');

module.exports = function (app) {
  app.post(
    '/login',
    route.ensureUnauthenticated,
    passport.authenticate(
      'local',
      {
        successRedirect: '/',
        failureRedirect: '/',
        failureFlash: true
      }
    )
  );
};