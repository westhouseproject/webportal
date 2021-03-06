var route = require('./middlewares');
var users = require('../users');

module.exports = function (app) {
  // TODO: merge this with another route.
  app.get(
    '/accounts',
    route.ensureAuthenticated,
    function (req, res, next) {
      users.getUsers(function (err, users) {
        if (err) { return next(err); }
        res.render('accounts', {
          users: users
        });
      })
    }
  )
};