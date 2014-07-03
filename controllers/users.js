var route = require('./middlewares');
var users = require('../users');

module.exports = function (app) {
  app.get(
    '/users',
    route.ensureAuthenticated,
    function (req, res, next) {
      users.getUsers(function (err, users) {
        if (err) { return next(err); }
        res.json(users);
      });
    }
  )
};