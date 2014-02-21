module.exports = function (app) {
  app.get(
    '/',
    function (req, res, next) {
      if (req.isAuthenticated()) { return next(); }
      res.render('index/log-in');
    },
    function (req, res, next) {
      if (req.user.devices.length) { return next(); }
      res.render('index/no-devices')
    },
    function (req, res, next) {
      if (req.user.devices.length > 1) { return next(); }
      res.redirect('/devices/' + req.user.devices[0].uuid_token);
    },
    function (req, res) {
      res.render('index/devices');
    }
  );
};