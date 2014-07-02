var route = require('./middlewares');
var users = require('../users');

module.exports = function (app) {
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
}