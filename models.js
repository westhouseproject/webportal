var Sequelize = require('sequelize');
var crypto = require('crypto');
var uuid = require('node-uuid');
var validator = require('validator');
var async = require('async');
var bcrypt = require('bcrypt');
var bluebird = require('bluebird');
var _ = require('lodash');
var settings = require('./settings');

module.exports.define = function (sequelize) {

  // This is where we will be storing our model classes.
  var retval = {};

  /*
   * Represents an error that occurs after determining that a set of inputs are
   * invalid for inserting into the database.
   */

  retval.ValidationErrors = ValidationErrors;
  function ValidationErrors(err) {
    var finalMessage = [];
    this.name = 'ValidationErrors';
    Object.keys(err).forEach(function (key) {
      finalMessage.push(key + ': ' + err[key]);
    });
    this.message = finalMessage.join('\n');
    this.fields = err;
    _.assign(this, err);
  }
  ValidationErrors.prototype = Error.prototype;

  /*
   * An error occures when the user
   */

  // TODO: remove this redundant class. It's much better to resolve using a null
  //   value to imply that there was an error on the user end, than to return an
  //   error as if it was the server. It's not the server's fault, it's the
  //   user's
  retval.UnauthorizedError = UnauthorizedError;
  function UnauthorizedError(message) {
    Error.apply(this, arguments);
    this.name = 'UnauthorizedError';
    this.message = message;
    this.unauthorized = true;
  }
  UnauthorizedError.prototype = Error.prototype;

  /*
   * An error occures when the user fails to be verified
   */

  // TODO: remove this redundant class. It's much better to resolve using a null
  //   value to imply that there was an error on the user end, than to return an
  //   error as if it was the server. It's not the server's fault, it's the
  //   user's
  function VerificationError(message) {
    Error.apply(this, arguments);
    this.name = 'VerificationError';
    this.message = message;
    this.verified = false;
  }
  VerificationError.prototype = Error.prototype;

  /*
   * Floor to the nearest interval of a given date object. E.g. 12:32 will be
   * floored to 12:30 if the interval was 1000 * 60 * 5 = 5 minutes.
   */

  var roundTime = retval.roundTime = function roundTime(date, coeff) {
    var retval = new Date(Math.floor(date.getTime() / coeff) * coeff);
    return retval;
  };

  // TODO: set a custom primary key for both the users and alis_device tables.

  /*
   * The devices that consume energy.
   */

  var EnergyConsumer = retval.EnergyConsumer = sequelize.define('energy_consumer', {
    name: Sequelize.STRING,
    /*
     * This is the unique identifier represented by the ALIS device.
     */
    remote_consumer_id: {
      type: Sequelize.STRING,
      allowNull: false
    }
  });

  /*
   * Represents an ALIS device.
   */

  // TODO: find a way to gracefully regenerate a new UUID if one already
  //   existed.

  var ALISDevice = retval.ALISDevice = sequelize.define('alis_device', {
    common_name: Sequelize.STRING,
    uuid_token: {
      type: Sequelize.STRING,
      unique: true,
      allowNull: false,
      validation: {
        isUUID: 4
      }
    },

    // TODO: find some ways to hide this information from users who are not
    //   owners of an instance of this model.
    client_secret: Sequelize.STRING
  }, {
    instanceMethods: {
      resetClientSecret: function () {
        this.client_secret = crypto.randomBytes(20).toString('hex');
      },
      getOwner: function () {
        var def = bluebird.defer();
        UserALISDevice.find({
          where: [ 'alis_device_id = ? AND privilege = ?', this.id, 'owner' ]
        }).complete(function (err, join) {
          if (err) { def.reject(err); }
          if (!join) {
            return def.resolve(null);
          }
          User.find(join.user_id).complete(function (err, user) {
            if (err) {
              return def.reject(err);
            }
            def.resolve(user);
          });
        });
        return def.promise;
      },

      isOwner: function (user) {
        var def = bluebird.defer();
        this.getOwner().then(function (u) {
          def.resolve(u.id === user.id);
        }).catch(function (err) {
          def.reject(err);
        });
        return def.promise;
      },

      isAdmin: function (user) {
        var def = bluebird.defer();
        UserALISDevice.find({
          where: [
            'alis_device_id = ? AND user_id = ? AND privilege = ? OR privilege = ?',
            this.id,
            user.id,
            'admin',
            'owner'
          ]
        }).complete(function (err, user) {
          if (err) { return def.reject(err); }
          def.resolve(!!user);
        });
        return def.promise;
      },

      hasAccess: function (user) {
        var def = bluebird.defer();
        UserALISDevice.find({
          where: [
            'alis_device_id = ? AND user_id = ?',
            this.id,
            user.id
          ]
        }).complete(function (err, user) {
          if (err) { return def.reject(err); }
          def.resolve(!!user);
        });
        return def.promise;
      },

      /*
       * Will give limited access to the specified user.
       */

      grantAccessTo: function (admin, user) {
        var def = bluebird.defer();
        var self = this;
        this.isAdmin(admin).then(function (result) {
          if (!result) {
            def.reject(new Error('The user is not an admin.'));
          }
          UserALISDevice.create({
            user_id: user.id,
            alis_device_id: self.id,
            adminUserID: admin.id
          }).complete(function (err, join) {
            if (err) { def.reject(err); }
            def.resolve(user);
          });
        }).catch(function (err) {
          def.reject(err);
        });
        return def.promise;
      },

      findOrCreateEnergyConsumer: function (consumerID) {
        var def = bluebird.defer();
        var self = this;
        this.getEnergyConsumers({
          where: [ 'remote_consumer_id = ?', consumerID ]
        }).complete(function (err, consumers) {
          if (err) { return def.reject(err); }
          if (consumers[0]) { return def.resolve(consumers[0]); }
          EnergyConsumer.create({
            remote_consumer_id: consumerID
          }).complete(function (err, consumer) {
            if (err) { def.reject(err); }
            self.addEnergyConsumer(consumer).complete(function (err, consumer) {
              if (err) { def.reject(err); }
              def.resolve(consumer);
            });
          });
        });
        return def.promise;
      },

      _getRawEnergyReadings: function (options) {
        var def = bluebird.defer();

        options = options || {};

        var defaults = {
          summed: true
        };
        options = _.assign(_.assign({}, defaults), options);

        var maxRange = 60;

        if (!options.to) {
          options.to = Math.floor(new Date().getTime() / 1000)
        }

        if (!options.from) {
          options.from = options.to - maxRange;
        }

        // Truncate the range, to prevent excessive memory use.
        if (options.to - options.from > maxRange) {
          options.from = options.to - maxRange;
        }

        EnergyConsumptions.findAll({
          where: [
            'UNIX_TIMESTAMP(time) > ? AND UNIX_TIMESTAMP(time) < ?',
            options.from,
            options.to
          ],
          order: 'time DESC',
        }).complete(function (err, consumptions) {
          if (err) { return def.reject(err); }

          if (!consumptions.length) {
            return def.resolve(consumptions);
          }

          consumptions = consumptions.map(function (consumption) {
            return {
              id: consumption.energy_consumer_id,
              time: consumption.time,
              kw: consumption.kw,
              kwh: consumption.kwh,
              kwh_difference: consumption.kwh_difference
            };
          });

          var timeset = {};

          consumptions.forEach(function (consumption) {
            timeset[consumption.time.toString()] = true;
          });

          consumptions = _.groupBy(consumptions, function (consumption) {
            return consumption.id;
          });

          Object.keys(consumptions).forEach(function (key) {
            var group = consumptions[key];
            var set = {};
            group.forEach(function (consumption) {
              set[consumption.time.toString()] = true;
            });
            Object.keys(timeset).forEach(function (k) {
              if (!set[k]) {
                group.push({
                  id: key,
                  time: new Date(k),
                  kw: 0,
                  kwh: 0,
                  kwh_difference: 0
                });
              }
            });
            consumptions[key] = group.sort(function (a, b) {
              return a.time - b.time;
            });
          });

          if (!options.summed) {
            return def.resolve(consumptions);
          }

          var keys = Object.keys(consumptions);

          var sums = [];

          consumptions = consumptions[keys[0]].map(function (c, i) {
            var sum = {
              time: c.time,
              kw: c.kw,
              kwh: c.kwh,
              kwh_difference: c.kwh_difference
            };
            return keys.reduce(function (prev, curr) {
              return {
                time: prev.time,
                kw: prev.kw + consumptions[curr][i].kw,
                kwh: prev.kwh + consumptions[curr][i].kwh,
                kwh_difference: prev.kwh_difference + consumptions[curr][i].kwh_difference
              };
            }, sum);
          });

          def.resolve(consumptions);
        });

        return def.promise;
      },

      _getEnergyReadings: function (options) {
        var def = bluebird.defer();

        options = options || {};

        var defaults = {
          summed: true,
          granularity: '1m'
        };
        options = _.assign(_.assign({}, defaults), options);

        if (!seriesCollection[options.granularity]) {
          return def.reject(new Error('Granularity not supported'));
        }

        var maxRange = Math.floor(seriesCollection[options.granularity].maxRange / 1000);

        if (!options.to) {
          options.to = Math.floor(new Date().getTime() / 1000)
        }

        if (!options.from) {
          options.from = options.to - maxRange;
        }

        // Truncate the range, to prevent excessive memory use.
        if (options.to - options.from > maxRange) {
          options.from = options.to - maxRange;
        }

        seriesCollection[options.granularity].model.findAll({
          where: [
            'UNIX_TIMESTAMP(time) > ? AND UNIX_TIMESTAMP(time) < ?',
            options.from,
            options.to
          ],
          order: 'time DESC',
        }).complete(function (err, consumptions) {
          if (err) { return def.reject(err); }

          consumptions = consumptions.map(function (consumption) {
            return {
              id: consumption.energy_consumer_id,
              time: consumption.time,
              kwh_sum: consumption.kwh_sum,
              kwh_average: consumption.kwh_average,
              kwh_min: consumption.kwh_min,
              kwh_max: consumption.kwh_max
            };
          });

          var timeset = {};

          consumptions.forEach(function (consumption) {
            timeset[consumption.time.toString()] = true;
          });

          consumptions = _.groupBy(consumptions, function (consumption) {
            return consumption.id;
          });

          Object.keys(consumptions).forEach(function (key) {
            var group = consumptions[key];
            var set = {};
            group.forEach(function (consumption) {
              set[consumption.time.toString()] = true;
            });
            Object.keys(timeset).forEach(function (k) {
              if (!set[k]) {
                group.push({
                  id: key,
                  time: new Date(k),
                  kwh_sum: 0,
                  kwh_average: 0,
                  kwh_min: 0,
                  kwh_max: 0
                });
              }
            });
            consumptions[key] = group.sort(function (a, b) {
              return a.time - b.time;
            });
          });

          if (!options.summed) {
            return def.resolve(consumptions);
          }

          var keys = Object.keys(consumptions);

          var sum = [];

          consumptions = consumptions[keys[0]].map(function (c, i) {
            var sum = {
              time: c.time,
              kwh_sum: c.kwh_sum == null || isNaN(c.kwh_sum) ? 0 : c.kwh_sum,
              kwh_average: c.kwh_average == null || isNaN(c.kwh_average) ? 0 : c.kwh_average,
              kwh_min: c.kwh_min == null || isNaN(c.kwh_min) ? 0 : c.kwh_min,
              kwh_max: c.kwh_max == null || isNaN(c.kwh_max) ? 0 : c.kwh_max
            };
            return keys.reduce(function (prev, curr) {
              var c = consumptions[curr][i];
              var current = {
                time: c.time,
                kwh_sum: c.kwh_sum == null || isNaN(c.kwh_sum) ? 0 : c.kwh_sum,
                kwh_average: c.kwh_average == null || isNaN(c.kwh_average) ? 0 : c.kwh_average,
                kwh_min: c.kwh_min == null || isNaN(c.kwh_min) ? 0 : c.kwh_min,
                kwh_max: c.kwh_max == null || isNaN(c.kwh_max) ? 0 : c.kwh_max
              };

              var retval = {
                time: prev.time,
                kwh_sum: prev.kwh_sum + current.kwh_sum,
                kwh_average: prev.kwh_average + current.kwh_average,
                kwh_min: Math.min(prev.kwh_min, current.kwh_min),
                kwh_max: Math.max(prev.kwh_max, current.kwh_max)
              };

              return retval;
            }, sum);
          });

          def.resolve(consumptions);
        });

        return def.promise;
      },

      // TODO: document this.
      getEnergyReadings: function (options) {
        var options = options || {};
        options.granularity = options.granularity || 'raw';

        if (options.granularity === 'raw') {
          return this._getRawEnergyReadings(options);
        }

        return this._getEnergyReadings(options)
      }
    },
    hooks: {
      beforeValidate: function (device, callback) {
        if (device.isNewRecord) {
          device.uuid_token = uuid.v4();
          device.resetClientSecret();
        } else if (device.changed('uuid_token')) {
          return callback(new Error('uuid_token should not change'));
        }

        process.nextTick(function () {
          callback(null);
        });
      }
    }
  });

  /*
   * Represents a user.
   */

  // TODO: enable account recovery, when the user has their email changed.
  var User = retval.User = sequelize.define('user', {
    username: {
      type: Sequelize.STRING,
      unique: true,
      allowNull: false,
      validate: {
        is: [ '^[a-z0-9_-]{1,35}$', '' ]
      }
    },
    chosen_username: {
      type: Sequelize.STRING,
      unique: true,
      allowNull: false,
      validate: {
        is: [ '^[A-Za-z0-9_-]{1,35}$', '' ]
      }
    },
    full_name: {
      type: Sequelize.STRING,
      validate: {
        len: [0, 200]
      }
    },
    email_address: {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: Sequelize.STRING,
      allowNull: false
    },
    verification_code: Sequelize.STRING,
    password_reset_code: Sequelize.STRING,
    password_reset_expiry: Sequelize.DATE,
    api_key: {
      type: Sequelize.STRING,
      allowNull: false
    },
    client_secret: {
      type: Sequelize.STRING,
      allowNull: false
    }
  }, {
    instanceMethods: {
      normalizeUsername: function () {
        // TODO: check for changes in the `chosen_username` column.

        if (this.changed('username')) {
          this.chosen_username = this.username;
          this.username = this.chosen_username.toLowerCase();
        }
      },

      /*
       * Verifies a user. Without verification, the user can't register a new
       * ALIS device.
       */

      verify: function (verification_code, email_address) {
        var def = bluebird.defer();
        var self = this;


        process.nextTick(function () {
          if (
            verification_code !== self.verification_code ||
            email_address !== self.email_address
          ) {
            var err = new VerificationError('Error verification code or email don\'t match.');
            err.notVerified = true;
            return def.reject(err);
          }

          self.updateAttributes({
            verification_code: null
          }).complete(function (err, user) {
            if (err) { return def.reject(err); }
            def.resolve(user);
          });
        });

        return def.promise;
      },

      _changeVerificationCode: function () {
        this.verification_code = uuid.v4();
      },

      /*
       * A convenience function to quickly change the user's verification code.
       */

      resetVerificationCode: function () {
        this._changeVerificationCode();
        return this.save();
      },

      /*
       * Convenience method, used to determine whether or not the user is verified.
       */

      isVerified: function () {
        return this.verification_code == null;
      },

      /*
       * Gets rid of the password reset flags.
       */

      // TODO: actually call this method!
      _clearPasswordReset: function () {
        this.password_reset_code = null;
        this.password_reset_expiry = null;
        return this.save();
      },

      /*
       * A convenience function for changing the password, given a previous one.
       */

      // TODO: unit test this.
      changePassword: function (oldPassword, newPassword) {
        var self = this;
        var def = bluebird.defer();
        bcrypt.compare(oldPassword, this.password, function (err, res) {
          if (err) { return def.reject(err); }
          if (!res) { return def.resolve({ result: false}); }
          self.password = newPassword;
          self.save().complete(function (err, user) {
            if (err) { return def.reject(err); }
            def.resolve({ result: true, user: user});
          });
        });
        return def.promise;
      },

      _resetClientSecret: function () {
        this.client_secret = crypto.randomBytes(32).toString('hex');
      },

      resetClientSecret: function () {
        this._resetClientSecret();
        return this.save();
      }
    },
    classMethods: {
      authenticate: function (username, password) {
        var def = bluebird.defer();

        // NB: search for a username is case-insensitive.

        this
          .find({
            where: [ 'username = ? OR email_address = ?', username, username ]
          }).complete(function (err, user) {
            if (err) { return def.reject(err); }
            if (!user) {
              return def.reject(new UnauthorizedError('User not found'));
            }
            bcrypt.compare(password, user.password, function (err, res) {
              if (err) {
                return def.reject(err);
              }
              if (!res) {
                return def.reject(new UnauthorizedError('Password does not match'));
              }

              def.resolve(user);
            });
          });

        return def.promise;
      },

      /*
       * Sets a user's password reset code.
       */

      setResetFlag: function (email) {
        var def = bluebird.defer();
        this.find({
          where: [ 'email_address = ?', email ]
        }).complete(function (err, user) {
          if (err) { return def.reject(err); }
          if (!user) { return def.resolve(null); }
          user.password_reset_code = uuid.v4();
          user.save().complete(function (err, user) {
            if (err) { return def.reject(err); }
            def.resolve(user);
          })
        });
        return def.promise;
      },

      // TODO: integration/unit test this.
      isResetRequestValid: function (email, code) {
        var def = bluebird.defer();
        this.find({
          where: [
            'email_address = ? AND password_reset_code = ?',
            email,
            code
          ]
        }).complete(function (err, user) {
          var time = new Date();
          if (err) { return def.reject(err); }
          if (!user) { return def.resolve({ result: false }); }
          if (user.password_reset_expiry < time) { return def.resolve({ result: false }); }
          def.resolve({ result: true, user: user });
        });
        return def.promise;
      },

      // TODO: move the reset request validation to the above
      //   isResetRequestValid method.
      resetPassword: function (email, resetCode, newPassword) {
        var def = bluebird.defer();
        this.isResetRequestValid(email, resetCode).then(function (res) {
          var result = res.result;
          var user = res.user;

          if (!result || !user) {
            return def.resolve(null);
          }

          user.password = newPassword;
          user.save().complete(function (err, user) {
            def.resolve(user);
          });
        }).catch(def.reject.bind(def));
        return def.promise;
      }
    },
    hooks: {
      beforeValidate: function (user, callback) {
        async.parallel([
          function (callback) {
            if (user.isNewRecord) {
              // TODO: use the helper function.
              user.verification_code = uuid.v4();
            }
            process.nextTick(function () {
              callback(null);
            });
          },
          function (callback) {
            if (user.isNewRecord) {
              user.api_key = crypto.randomBytes(16).toString('hex');
            } else if (user.changed('api_key')) {
              return process.nextTick(function () {
                callback(new Error('Cannot change API key'));
              });
            }
            process.nextTick(function () {
              callback(null);
            });
          },
          function (callback) {
            if (user.isNewRecord) {
              user._resetClientSecret();
            }
            return process.nextTick(function () {
              callback(null);
            });
          },
          function (callback) {
            if (
              !user.isNewRecord &&
              user.changed('verification_code') &&
              user.previous('verification_code') == null) {
              return process.nextTick(function () {
                callback(new ValidationErrors({
                  verification_code: 'The user is already verified.'
                }));
              });
            }
            process.nextTick(function () {
              callback(null);
            });
          },
          function (callback) {
            user.normalizeUsername();
            process.nextTick(function () {
              callback(null);
            });
          },
          function (callback) {
            // 6 is a hard limit unfortunately.
            if (
              !user.password ||
              (user.changed('password') && user.password.length < 6)
            ) {
              return process.nextTick(function () {
                callback(new ValidationErrors({
                  password: 'Password is too short'
                }));
              });
            }
            if (user.changed('password')) {
              return bcrypt.hash(user.password, 12, function (err, hash) {
                if (err) { return callback(err); }
                user.password = hash;
                callback(null);
              });
            }

            callback(null);
          },
          function (callback) {
            if (user.password_reset_code != null && !validator.isUUID(user.password_reset_code)) {
              return process.nextTick(function () {
                callback(new ValidationErrors({
                  password_reset_code: 'The password reset code must be a UUID token.'
                }));
              })
            }
            process.nextTick(function () {
              callback(null);
            });
          },
          function (callback) {
            if (
              user.changed('password_reset_code') &&
              user.password_reset_code != null
            ) {
              user.password_reset_expiry = new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 2);
            }
            process.nextTick(function () {
              callback(null);
            });
          }
        ], function (err) {
          if (err) {
            return callback(err);
          }

          callback(null);
        });
      }
    }
  });

  /*
   * A join table to aid with many-to-many relationship with users and ALIS
   * devices.
   */

  var UserALISDevice = retval.UserALISDevice = sequelize.define('user_alis_device', {
    privilege: {
      type: Sequelize.ENUM,
      values: [ 'owner', 'admin', 'limited' ],
      defaultValue: 'limited',
      allowNull: false
    }
  }, {
    hooks: {
      beforeValidate: function (join, callback) {

        async.waterfall([
          // First, check to see if the user is even verified, before even
          // creating this join.
          function (callback) {
            User.find(join.user_id).complete(function (err, user) {
              if (err) { return callback(err); }
              if (user.isVerified()) { return callback(null); }

              // If we're here, then this means that the user is not verified.

              var retError = new Error('The user is not verified.');
              retError.notVerified = true;

              // Try and determine if the ALIS device already has a set of users
              // maintaining it. If not, then delete the device.
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

                device.isAdmin(user).then(function (result) {
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
    }
  });

  /*
   * Returns a function that will be used for merging multiple data points in a
   * higher granularity as well as notify other lower granular models that this
   * model had an update.
   */

  function createCollector(interval, nextGranularity) {
    return function (granularModel, time, energy_consumer_id) {
      var self = this;

      var rounded = roundTime(time, interval);

      var def = bluebird.defer();
      var promise = def.promise;

      // TODO: remove these success and error extensions. Too much cruft.

      promise.success = function (fn) {
        return promise.then(fn);
      };

      promise.error = function (fn) {
        return promise.then(function () {}, fn);
      };

      var whereClause = [
        'time > ? && time <= ? && energy_consumer_id = ?',
        rounded,
        time,
        energy_consumer_id
      ];

      granularModel.model.findAll({
        where: whereClause
      }).success(function (consumptions) {
        var statistics = {
          kwh: 0,
          kwh_average: 0
        };
        if (consumptions.length) {
          var kwhs = consumptions.map(function (consumption) {
            return consumption.values[granularModel.readingsPropertyName];
          });
          statistics.kwh_sum = kwhs.reduce(function (prev, curr) {
            return prev + curr;
          });
          statistics.kwh_average = statistics.kwh_sum / kwhs.length;
          statistics.kwh_min = kwhs.slice().sort()[0];
          statistics.kwh_max = kwhs.slice().sort()[kwhs.length - 1];
        }

        var query = {
          order: 'time DESC',
          where: [ 'energy_consumer_id = ?', energy_consumer_id ]
        }

        self.find(query).success(function (unitData) {
          function collectNext(prevData) {
            var parameters = [
              {
                model: self,
                readingsPropertyName: 'kwh_sum'
              },
              prevData.values.time,
              energy_consumer_id
            ];

            nextGranularity
            .collectRecent.apply(nextGranularity, parameters)
            .success(function (nextData) {
              def.resolve(nextData);
            }).error(function (err) {
              def.reject(err)
            });
          }

          if (
              !unitData ||
              // For some odd reason, the queried values do not correspond
              // with the columns defined in the database schema. Hence why
              // I'm omitting the `.getTime()` call from
              // `unitData.values.time`.
              rounded.getTime() !==
                roundTime(unitData.values.time, interval).getTime()
          ) {
            var tableSpecificProperties = {
                time: roundTime(time, interval),
                energy_consumer_id: energy_consumer_id
              };

            self.create(
              _.assign(
                tableSpecificProperties,
                statistics
              )
            )
            .success(function (unitData) {
              if (!nextGranularity) {
                return def.resolve(unitData);
              }

              collectNext(unitData);
            }).error(function (err) {
              def.reject(err);
            });

            return

          }

          _.assign(unitData.values, statistics);

          unitData.save().success(function (unitData) {
            if (!nextGranularity) {
              return def.resolve(unitData);
            }

            collectNext(unitData);
          }).error(function (err) {
            def.reject(err);
          });
        }).error(function (err) {
          def.reject(err);
        });
      }).error(function (err) {
        def.reject(err);
      });

      return promise;
    };
  }

  /*
   * Generates a model.
   *
   * A model is what will be used for storing and retrieving data in a particular
   * time-series granularity.
   */

  function createModel(tableName, interval, nextGranularity) {
    return sequelize.define(tableName, {
      energy_consumer_id: {
        type: Sequelize.INTEGER(11),
        validate: {
          notNull: true
        }
      },
      time: {
        type: Sequelize.DATE,
        notNull: true
      },
      kwh_sum: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      },
      kwh_average: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      },
      kwh_min: Sequelize.FLOAT,
      kwh_max: Sequelize.FLOAT,
    }, {
      freezeTableName: true,
      timestamps: false,
      classMethods: {
        collectRecent: nextGranularity ?
          createCollector(interval, nextGranularity) :
            createCollector(interval)
      }
    });
  }

  /*
   * Will hold a list of all models that represent a series, in a given time
   * series.
   */

  var seriesCollection = {};

  (function () {

    var seriesCollectionMeta = {
      '1m': {
        interval: 1000 * 60,
        nextGranularity: '5m',
        maxRange: 1000 * 60 * 60
      },
      '5m': {
        interval: 1000 * 60 * 5,
        nextGranularity: '1h',
        maxRange: 1000 * 60 * 60 * 5
      },
      '1h': {
        interval: 1000 * 60 * 60,
        maxRange: 1000 * 60 * 60 * 24
      }
    };

    var done = {};

    function setSeries(key) {

      if (done[key]) {
        return;
      }

      var nextGranularity = seriesCollectionMeta[key].nextGranularity;
      if (nextGranularity) {

        setSeries(nextGranularity);

        seriesCollection[key].model = createModel(
          'energy_consumptions_' + key,
          seriesCollectionMeta[key].interval,
          seriesCollection[nextGranularity].model
        );

      } else {

        seriesCollection[key].model = createModel(
          'energy_consumptions_' + key,
          seriesCollectionMeta[key].interval
        );

      }

      seriesCollection[key].maxRange = seriesCollectionMeta[key].maxRange;

      done[key] = true;

    }

    Object.keys(seriesCollectionMeta).map(function (key) {
      seriesCollection[key] = {};
      return key;
    }).forEach(function (key) {
      setSeries(key);
    });

  })();

  /*
   * Holds information about energy usage by every single devices.
   */

  var EnergyConsumptions = retval.EnergyConsumptions =
    sequelize.define('energy_consumptions', {
      // TODO: This is being defined from somewhere else as well. Have it be only
      //   defined from one place.
      energy_consumer_id: {
        type: Sequelize.INTEGER(11),
        validate: {
          notNull: true
        }
      },

      time: {
        type: Sequelize.DATE,
        validate: {
          notNull: true
        }
      },

      kw: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      },
      kwh: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      },
      kwh_difference: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      }
    }, {
      freezeTableName: true,
      timestamps: false,
      hooks: {
        beforeValidate: function (consumption, callback) {
          var self = this;

          // Look for the most recent entry.
          this.find({
            where: [ 'energy_consumer_id = ?', consumption.energy_consumer_id ],
            order: 'time DESC' })
          .success(function (prev) {
            if (prev) {
              // We want our data to be inserted in chronological order. Throw
              // an error if anything screws up.
              if (prev.values.time > consumption.values.time) {
                var err = new Error(
                  'Current time: ' + consumption.values.time + '\n' +
                  'Previous time: ' + prev.values.time + '\n\n' +
                  'Current time must be greater than previous time'
                );
                return callback(err);
              }
              consumption.values.kwh_difference =
                consumption.values.kwh - prev.values.kwh;
            } else {
              consumption.values.kwh_difference = consumption.values.kwh
            }

            callback(null, consumption);
          }).error(callback);
        },
        afterCreate: function (consumption, callback) {
          seriesCollection['1m'].model.collectRecent(
            {
              model: this,
              readingsPropertyName: 'kwh_difference'
            }, 
            consumption.time,
            consumption.energy_consumer_id
          )
          .success(function () {
            callback(null, consumption);
          })
          .error(callback);
        }
      }
    });

  /*
   * An override of the `bulkCreate` static method. Accepts an array of data.
   * The data takes on the format of
   *
   *     {
   *       "time": ...,
   *       "uuid_token": ...,
   *       "client_secret": ...,
   *       "energy_consumptions": [
   *         {
   *           remote_consumer_id: ...
   *           kw: ...
   *           kwh: ...
   *         }
   *         ...
   *       ]
   *     }
   */

  // Note: Because this method is being overridden, it may mean that bugs may
  // arise. So far, there doesn't seem to be any, so let's keep this overridden.
  EnergyConsumptions.bulkCreate = function (data) {
    var self = this;
    var def = bluebird.defer();

    ALISDevice.find({
      where: [
        'uuid_token = ? AND client_secret = ?',
        data.uuid_token,
        data.client_secret
      ]
    }).complete(function (err, device) {
      if (err) { return def.reject(err); }
      if (!device) {
        return def.reject(new Error('An ALIS device with the given UUID token and client secret not found'));
      }
      async.map(data.energy_consumptions, function (consumption, callback) {
        device.findOrCreateEnergyConsumer(consumption.id)
          .then(function (consumer) {
            EnergyConsumptions.create({
              energy_consumer_id: consumer.id,
              time: data.time,
              kw: consumption.kw,
              kwh: consumption.kwh
            }).success(function (con) {
              callback(null, con);
            }).error(function (err) {
              if (err instanceof Error) {
                return callback(err);
              }
              callback(new ValidationErrors(err));
            });
          }).catch(function (err) {
            throw err;
          });
      }, function (err, consumptions) {
        if (err) { return def.reject(err); }
        def.resolve(consumptions);
      });
    });
    return def.promise;
  };

  // Associations.

  ALISDevice.hasMany(EnergyConsumer, {
    as: 'EnergyConsumers',
    foreignKey: 'alis_device_id'
  });

  User.hasMany(ALISDevice, {
    as: 'ALISDevice',
    through: UserALISDevice,
    foreignKey: 'user_id'
  });

  ALISDevice.hasMany(User, {
    as: 'User',
    through: UserALISDevice,
    foreignKey: 'alis_device_id'
  });

  retval.prepare = function (callback) {
    if (settings.get('database:sync')) {
      console.log('Synchronizing');
      if (!!settings.get('database:forceSync')) {
        console.log('Dropping all tables');
      }
      sequelize
        .sync({ force: !!settings.get('database:forceSync') })
        .complete(function (err) {
          if (err) { throw err; }
          callback();
        });
    } else {
      process.nextTick(callback);
    }
  }

  return retval;
};
