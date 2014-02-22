var Sequelize = require('sequelize');
var seq = require('./seq');
var async = require('async');
var User = require('./User');
var ALISDevice = require('./ALISDevice');
var bluebird = require('bluebird');
var _ = require('lodash');

/*
 * A join table to aid with many-to-many relationship with users and ALIS
 * devices.
 */

var UserALISDevice = module.exports = seq.define('user_alis_device', {
  privilege: {
    type: Sequelize.ENUM,
    values: [ 'owner', 'admin', 'limited' ],
    defaultValue: 'limited',
    allowNull: false
  }
}, {
  // TODO: add a `isAdmin` instance method.
  hooks: {
    beforeValidate: function (join, callback) {
      var self = this;

      async.waterfall([
        // First, check to see if the user is even verified, before even
        // creating this join.
        function (callback) {
          User.find(join.user_id).complete(function (err, user) {
            if (err) { return callback(err); }

            // We know that the user is verified. So move to the next step.
            if (user.isVerified()) { return callback(null); }

            // If we're here, then this means that the user is not verified.

            var retError = new Error('The user is not verified.');
            retError.notVerified = true;

            // Try and determine if the ALIS device already has a set of users
            // maintaining it. If not, then delete the device.

            async.parallel({
              joins: function (callback) {
                UserALISDevice.findAll({
                  where: [ 'alis_device_id = ?', join.alis_device_id ]
                }).complete(callback);
              },

            })

            async.waterfall([
              function (callback) {
                ALISDevice.find(join.alis_device_id).complete(function (err, device) {
                  if (err) { return callback(err); }
                  device.getUser().complete(function (err, users) {
                    if (err) { return callback(err); }
                    if (users.length) {
                      return callback(null);
                    }
                    device.destroy().complete(function (err) {
                      if (err) { return callback(err); }
                      callback(null);
                    });
                  });
                });
              }
            ], function (err) {
              if (err) { return callback(err); }
              return callback(retError);
            });
          });
        },

        // First, check to see whether or not the device already has a set of
        // users. If it does, then check to see if an admin initiated the
        // creation of the join.
        function (callback) {
          // Find the device associated with this join.
          ALISDevice.find(join.alis_device_id).complete(function (err, device) {
            if (err) { return callback(err); }

            // TODO: check to see why a device will be null.
            if (!device) { return callback(null); }

            // Check to see whether or not the device already has users
            // associated with it.
            device.getUser().complete(function (err, users) {
              // No users? Then this join record is new.
              if (!users.length) { return callback(null); }

              // If there are users, then check to see if the current `join`
              // instance has a `adminUserID` property set, and if it does,
              // get the user associated to the ID, and check to see if that
              // user is an admin.

              // In this case, we'll grab that one admin user from the above
              // `users` variable. No need to send an extra roundtrip to the
              // database.
              var user = users.filter(function (user) {
                return user.id === join.dataValues.adminUserID;
              })[0];

              if (!user) {
                return callback(new Error('Only admins can give access.'));
              }

              self.isAdmin(user, device).then(function (result) {
                if (!result) {
                  return callback(new Error('Only admins can give access.'));
                }

                callback(null);
              }).catch(callback);
            });
          });
        }
      ], callback);

    },
    beforeCreate: function (join, callback) {
      this.findAll({
        where: ['alis_device_id', join.alis_device_id]
      }).complete(function (err, joins) {
        if (err) { return callback(err); }
        // This means that at the time of creating this join, the ALIS device
        // was an orphan, and therefore, the user associated to this join will
        // become an owner.
        if (!joins.length) {
          join.privilege = 'owner';
        }
        callback(null, join)
      });
    }
  },

  classMethods: {

    /*
     * Allows a specified admin to grants a specified user access to a specified
     * device. This function is idempotent, and hence can be called multiple
     * times, without any adverse effect.
     *
     * @param user Object is an instance of the User model.
     * @param device Object is an instance of the ALISDevice model.
     *
     * @returns Object is an instance of the 
     */

    // TODO: require a password to grant access to users.
    grantAccessTo: function (admin, user, device) {
      var self = this;
      var def = bluebird.defer();
      this.hasAccess(user, device).then(function (join) {
        if (join) { return def.resolve(join); }
        UserALISDevice.create({
          user_id: user.id,
          alis_device_id: device.id,
          adminUserID: admin.id
        }).complete(function (err, join) {
          if (err) { return def.reject(err); }
          def.resolve(join);
        });
      }).catch(function (err) {
        def.reject(err);
      });
      return def.promise;
    },

    /*
     * Checks to see whether or not the specified user has access to the
     * specified device.
     *
     * @param user Object is an instance of the User model.
     * @param device Object is an instance of the device
     *
     * @returns Object or Null either an instance of the UserALISDevice, that is
     *   *if* the user *has* access to the ALIS device, null otherwise.
     */

    // TODO: unit test this.
    hasAccess: function (user, device) {
      var def = bluebird.defer();
      this.find({
        where: [ 'user_id = ? AND alis_device_id = ?', user.id, device.id ]
      }).complete(function (err, join) {
        if (err) { def.reject(err); }
        def.resolve(join);
      });
      return def.promise;
    },

    /*
     * Checks to see whether or not the specified user is an admin of a specfied
     * device.
     */

    isAdmin: function (user, device) {
      var def = bluebird.defer();
      this.find({
        where: [ 'user_id = ? AND alis_device_id = ?', user.id, device.id ]
      }).complete(function (err, join) {
        if (err) { return def.reject(err); }
        if (!join) { return def.resolve(false); }
        def.resolve(join.privilege === 'owner' || join.privilege === 'admin');
      });
      return def.promise;
    },

    /*
     * Gets the user that has been set as the "owner" of the device.
     *
     * @param device Object the device from which to get the owner.
     *
     * @returns Object the user that is the owner. Although, highly unlikely,
     *   a null can be returned if no owners were found.
     */

    getOwner: function (device) {
      var def = bluebird.defer();
      this.findAll({
        where: [ 'alis_device_id = ?', device.id ]
      }).complete(function (err, joins) {
        if (err) { return def.reject(err); }
        var res =_.find(joins, function(join) {
          return join.privilege === 'owner'
        });
        User.find(res.user_id).complete(function (err, user) {
          if (err) { return def.reject(err); }
          return def.resolve(user);
        });
      });
      return def.promise;
    },

    /*
     * Checks to see whether or not the user is the owner of the said device.
     *
     * @param user Object is an instance of a User model.
     * @param device Object is an instance of a ALISDevice model.
     *
     * @returns Boolean true if the user *is* the owner. False otherwise.
     */

    isOwner: function (user, device) {
      var def = bluebird.defer();
      // We don't want the system to crash.
      if (!user || !device) {
        process.nextTick(function () {
          def.resolve(false);
        });
        return def.promise;
      }
      this.find({
        where: [
          'user_id = ? AND alis_device_id = ? AND privilege = ?',
          user.id,
          device.id,
          'owner'
        ]
      }).complete(function (err, join) {
        if (err) { return def.reject(err); }
        if (!join) { return def.resolve(false); }
        def.resolve(join.privilege === 'owner');
      });
      return def.promise;
    },

    /*
     * Gets all users that the specified device has.
     *
     * @param device Object is the device we want to get the list of all users.
     *
     * @returns Array a list of all users.
     */

    getMaintainers: function (device) {
      var def = bluebird.defer();
      if (!device) {
        process.nextTick(function () {
          def.resolve([]);
        });
        return def.promise;
      }
      this.findAll({
        where: [
          'alis_device_id = ?',
          device.id
        ]
      }).complete(function (err, joins) {
        if (err) { return def.reject(err); }
        if (!joins) { return joins; }
        async.map(joins, function (join, callback) {
          User.find(join.user_id).complete(callback);
        }, function (err, results) {
          if (err) { return def.resolve(err); }
          def.resolve(results);
        })
      });
      return def.promise;
    }
  }
});
