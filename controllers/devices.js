var route = require('./middlewares');
var async = require('async');
var models = require('../models');

module.exports = function (app) {
  app.get(
    '/devices/:uuid',
    route.ensureAuthenticated,
    function (req, res, next) {
      var device = req.user.devices.filter(function (device) {
        return device.uuid_token === req.params.uuid;
      })[0];

      // This often means that the user does not have access to the device.
      if (!device) { return next(); }

      device.getUser().complete(function (err, users) {
        var isOwner = false;
        async.each(users, function (user, callback) {
          async.parallel({
            isAdmin: function (callback) {
              models.UserALISDevice.isAdmin(user, device).then(function (isAdmin) {
                user.isAdmin = result;
                callback(null, isAdmin);
              }).catch(callback);
            },
            isOwner: function (callback) {
              models.UserALISDevice.isOwner(user, device).then(function (isOwner) {
                user.isOwner = isOwner;
                callback(null, isOwner);
              }).catch(callback);
            }
          }, callback);
        }, function (err) {
          models.UserALISDevice.isAdmin(req.user, device).then(function (isAdmin) {
            res.render('dashboard', {
              device: device,
              isAdmin: isAdmin,
              maintainers: users,
              isOwner: isOwner
            });
          }).catch(next);
        });
      });
    }
  );

  // TODO: require a password to add a maintainer.
  // TODO: email the added user that they've been added to the maintainers list.
  // TODO: email the admin that they have added a user to the maintainers list.
  app.post(
    '/devices/:uuid/maintainers',
    route.ensureAuthenticated,
    function (req, res, next) {
      models.ALISDevice.find({
        where: [ 'uuid_token = ?', req.params.uuid ]
      }).complete(function (err, device) {
        if (err) { return next(err); }
        if (!device) {
          return (function () {
            req.flash('error', 'The device can\'t be found for some reason.');
            res.redirect('/');
          })();
        }
        models.User.find({
          where: [ 'username = ?', req.body.username ]
        }).complete(function (err, u) {
          if (err) { return next(err); }
          if (!u) {
            return (function () {
              req.flash('error', 'The username, "' + req.body.username + '", is not associated with any user.');
              res.redirect('/devices/' + req.params.uuid);
            })();
          }
          device.grantAccessTo(req.user, u).then(function (user) {
            req.flash('success', 'User successfully added as a maintainer');
            res.redirect('/devices/' + req.params.uuid);
          }).catch(next);
        })
      });
    }
  );

  app.get(
    '/devices/register',
    route.ensureAuthenticated,
    function (req, res) {
      res.render('register-device');
    }
  );

  app.post(
    '/register-device',
    route.ensureAuthenticated,
    function (req, res, next) {
      req.user.createALISDevice({
        common_name: req.body.common_name
      }).complete(function (err, device) {
        if (err) { return next(err); }
        res.redirect('/');
      });
    }
  );

  /*
  app.put(
    '/devices/:uuid/maintainers/:id',
    ensureAuthenticated,
    function (req, res, next) {
      models.ALISDevice.find({
        where: [ 'uuid_token = ?', req.params.uuid ]
      }).complete(function (err, device) {
        if (err) { return next(err); }
        device.getUser({
          where: [ 'id = ?', req.params.id ]
        }).complete(function (err, users) {
          if (err) { return next(err); }
          var user = users[0];
          if (!user) {
            return (function () {
              req.flash('error', 'The user does not seem to be associated with the device');
              req.redirect('/devices/' + req.params.uuid);
            })();
          }
          if (req.body.admin === 'true') {
            return device.grantAccessTo
          }
        });
      });
    }
  );
  */
};