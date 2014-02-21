var route = require('./middlewares')

module.exports = function (app) {
  app.get(
    '/logout',
    route.ensureAuthenticated,
    function (req, res) {
      req.logout();
      res.redirect('/');
    }
  );
};