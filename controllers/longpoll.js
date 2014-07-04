var route = require('./middlewares');
var users = require('../users');

module.exports = function (app) {
  app.get(
    '/longpoll',
    route.ensureAuthenticated,
    function (req, res, next) {
      users.once('change', function (users) {
        res.json(users);
      });
    }
  );
};
