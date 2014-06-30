module.exports = function (app) {
  app.get(
    '/',
    function (req, res, next) {
      if (req.isAuthenticated()) { return next(); }
      res.render('index/log-in');
    },
    function (req, res, next) {
      res.render('index')
    }
  );
};