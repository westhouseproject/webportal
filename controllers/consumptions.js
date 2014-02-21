var route = require('./middlewares');

module.exports = function (app) {
  app.get(
    '/consumptions/:uuid',
    route.ensureAuthenticated,
    route.ensureVerified,
    function (req, res, next) {
      var device = req.user.devices.filter(function (device) {
        return req.params.uuid === device.uuid_token;
      })[0];
      if (!device) { return next(); }
      device.getEnergyReadings(req.query).then(function (readings) {
        res.json(readings);
      }).catch(function (err) {
        next(err);
      });
    }
  );
};