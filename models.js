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

  retval.UnauthorizedError = UnauthorizedError;
  function UnauthorizedError(message) {
    Error.apply(this, arguments);
    this.name = 'UnauthorizedError';
    this.message = message;
    this.unauthorized = true;
  }
  UnauthorizedError.prototype = Error.prototype;

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

      // TODO: document this.
      // TODO: add a convenience feature to aggregate the data.
      // TODO: rename this to `getEnergyConsumptions`.
      getEnergyReadings: function (options) {
        options = options || {};

        options = _.assign({}, options);

        if (/^(false|no|f|0)$/.test(options.summed)) { options.summed = false; }

        // TODO: unit test this.
        try {
          options.consumers = JSON.parse(options.consumers);
          options.consumers = options.consumers.map(function (consumer) {
            return consumer.toString();
          });
        } catch (e) {
          options.consumers = [];
        }

        var defaults = {
          from: new Date(),
          interval: 60 * 60,
          granularity: 'raw',
          consumers: [],
          summed: true
        };

        // Override the defaults, based on what the user specified.
        options = _.assign(defaults, options);

        var energyConsumersQuery = {};

        if (options.consumers.length) {
          energyConsumersQuery = {
            where: [ Array(options.consumers.length)
              .join('.')
              .split('.')
              .map(function () {
                return 'remote_consumer_id = ?'
              }).join(' OR ') ].concat(options.consumers)
          };
        }

        this.getEnergyConsumers(energyConsumersQuery).complete(function (err, consumers) {
          if (!consumers) { return def.resolve(null); }
          if (options.granularity === 'raw') {
            return (function () {
              var energyConsumptionsQuery = {
                where: [
                  Array(consumers.length)
                    .join('.')
                    .split('.')
                    .map(function () {
                      return 'energy_consumer_id = ?'
                    }).join(' OR ')
                ].concat(consumers.map(
                    function (consumer) {
                      return consumer.id;
                    }
                  )
                )
              };
              EnergyConsumptions.findAll(energyConsumptionsQuery).complete(function (err, consumptions) {
                if (!consumptions) { return def.resolve(null); }
                consumptions = _.groupBy(consumptions.map(function (consumption) {
                  return {
                    id: _.find(consumers, function (consumer) {
                      return consumption.energy_consumer_id === consumer.id;
                    }).remote_consumer_id,
                    time: consumption.time,
                    kw: consumption.kw,
                    kwh: consumption.kwh,
                    kwh_difference: consumption.kwh_difference
                  }
                }), function (consumption) {
                  return consumption.id;
                });
                if (!options.summed) {
                  return def.resolve(consumptions);
                }
                consumptions = Object.keys(consumptions).map(function (key) {
                  return consumptions[key];
                });
                // TODO: handle the cases when only one consumer was selected.
                consumptions = consumptions.reduce(function (prev, curr) {
                  return prev.map(function (prevVal, i) {
                    return {
                      time: prevVal.time,
                      kw: prevVal.kw + curr[i].kw,
                      kwh: prevVal.kwh + curr[i].kwh,
                      kwh_difference: prevVal.kwh_difference + curr[i].kwh_difference
                    }
                  })
                });
                def.resolve(consumptions);
              });
            })();
          }

          if (!seriesCollection[options.granularity]) {
            return def.reject(new Error('Granularity currently not supported'));
          }

          return (function () {
            var energyConsumptionsQuery = {
              where: [
                Array(consumers.length)
                  .join('.')
                  .split('.')
                  .map(function () {
                    return 'energy_consumer_id = ?'
                  }).join(' OR ')
              ].concat(consumers.map(
                  function (consumer) {
                    return consumer.id;
                  }
                )
              )
            };
            seriesCollection[options.granularity].model.findAll(energyConsumptionsQuery).complete(function (err, consumptions) {
              if (!consumptions) { return def.resolve(null); }
              consumptions = _.groupBy(consumptions.map(function (consumption) {
                var retval = {
                  id: _.find(consumers, function (consumer) {
                    return consumption.energy_consumer_id === consumer.id;
                  }).remote_consumer_id,
                  time: consumption.time,
                  kwh_sum: consumption.kwh_sum,
                  kwh_average: consumption.kwh_average,
                  kwh_min: consumption.kwh_min,
                  kwh_max: consumption.kwh_max
                };
                return retval;
              }), function (consumption) {
                return consumption.id;
              });
              if (!options.summed) {
                return def.resolve(consumptions);
              }
              consumptions = Object.keys(consumptions).map(function (key) {
                return consumptions[key];
              });
              // TODO: handle the cases when only one consumer was selected.
              consumptions = consumptions.reduce(function (prev, curr) {
                var mapped = prev.map(function (prevVal, i) {
                  return {
                    time: prevVal.time,
                    kwh_sum: prevVal.kwh_sum + curr[i].kwh_sum,
                    kwh_average: prevVal.kwh_average + curr[i].kwh_average,
                    kwh_min: prevVal.kwh_min + curr[i].kwh_min,
                    kwh_max: prevVal.kwh_max + curr[i].kwh_max
                  };
                });
                mapped.forEach(function (val) {
                  val.kwh_average = val.kwh_average / mapped.length;
                });
                return mapped;
              });
              def.resolve(consumptions);
            });
          })();
        });

        var def = bluebird.defer();

        return def.promise;
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
    verification_code: Sequelize.STRING
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
            var err = new Error('Error verification code or email don\'t match.');
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

      isVerified: function () {
        return this.verification_code == null;
      }
    },
    classMethods: {
      authenticate: function (username, password) {
        var def = bluebird.defer();

        // Search for a username is case-insensitive.

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
      }
    },
    hooks: {
      beforeValidate: function (user, callback) {
        async.parallel([
          function (callback) {
            if (user.isNewRecord) {
              user.verification_code = uuid.v4();
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
        nextGranularity: '5m'
      },
      '5m': {
        interval: 1000 * 60 * 5,
        nextGranularity: '1h'
      },
      '1h': {
        interval: 1000 * 60 * 60
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
      if (!!get.settings('database:forceSync')) {
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
