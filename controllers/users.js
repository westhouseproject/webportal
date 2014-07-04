var route = require('./middlewares');
var users = require('../users');
var async = require('async');

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
  );

  app.put(
    '/users/:id',
    function (req, res, next) {
      if (!req.accepts('json')) {
        return res.json(406, {message: 'We are currently only accepting JSON'});
      }
      next();
    },
    route.ensureAuthenticated,
    function (req, res, next) {
      // TODO: Postel's Robustness Principle: allow for a wider range of accept
      //     types. So far, only JSON is allowed.

      var reasons = {
        illegal: 403,
        badrequest: 400
      };

      async.waterfall([
        // First, verify the validity of the inputed data.
        function (callback) {
          users.isPermitted(
            req.user,
            req.body,
            function (err, success, reason) {
              if (err) { return callback(err); }
              if (!success) {
                return res.json(reasons[reason.reason], {
                  message: reason.message
                });
              }
              callback(null);
            }
          )
        },

        // Next, update the data.
        function (callback) {
          users.safeUpdate(
            req.params.id,
            req.body,
            function (err, doc, reason) {
              if (err) { return callback(err); }
              callback(null);
            }
          );
        }
      ], function (err, doc) {
        if (err) { return next(err); }
        res.json({
          message: 'Success!'
        });
      });
    }
  )
};
