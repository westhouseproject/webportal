var Sequelize = require('sequelize');
var seq = require('./seq');
var crypto = require('crypto');
var uuid = require('node-uuid');
var validator = require('validator');
var async = require('async');
var bcrypt = require('bcrypt');
var bluebird = require('bluebird');
var _ = require('lodash');
var settings = require('../settings');

/*
 * Floor to the nearest interval of a given date object. E.g. 12:32 will be
 * floored to 12:30 if the interval was 1000 * 60 * 5 = 5 minutes.
 */

var roundTime = module.exports.roundTime = function roundTime(date, coeff) {
  var retval = new Date(Math.floor(date.getTime() / coeff) * coeff);
  return retval;
};

// 

// TODO: implement this.
var sunday = module.exports.sinceSunday = function sinceSunday(date) {
  return date;
};

// TODO: implement this.
var firstOfMonth = module.exports.sinceFirstOfMonth = function sinceFirstOfMonth(date) {
  return date;
};

// TODO: implement this.
var firstOfYear = module.exports.sinceFirstOfYear = function sinceFirstOfYear(date) {
  return date;
};

  module.exports.seq = require('./seq');


  // This is where we will be storing our model classes.
  var retval = {};

  var ReadPoint = module.exports.ReadPoint = require('./ReadPoint');
  var UserALISDevice = module.exports.UserALISDevice = require('./UserALISDevice');
  var ALISDevice = module.exports.ALISDevice = require('./ALISDevice');
  var User = module.exports.User = require('./User');

  // TODO: move these association calls elsewhere.

  User.hasMany(ALISDevice, {
    as: 'ALISDevice',
    through: UserALISDevice,
    foreignKey: 'user_id'
  });

  ALISDevice.hasMany(ReadPoint, {
    as: 'ReadPoints',
    foreignKey: 'alis_device_id'
  });

  ALISDevice.hasMany(User, {
    as: 'User',
    through: UserALISDevice,
    foreignKey: 'alis_device_id'
  });

  /*
   * Returns a function that will be used for merging multiple data points in a
   * higher granularity as well as notify other lower granular models that this
   * model had an update.
   *
   * @param intervalFn Function is a function that returns a number, that
   *   represents the interval to get the data from.
   */

  // TODO: expect the interval to be a function and not a number.
  // TODO: expand this function to work with other types of readings, such as
  //   energy production, water use, and gas use.
  function createCollector(intervalFn, nextGranularity) {

    /*
     * @param granularModel Object represents the granular
     */
    return function (granularModel, time, read_point_id) {
      var self = this;

      // The `interval` parameter is a function. Convert it into a number by
      // calling it.
      var interval = intervalFn();

      // Round to the nearest interval.
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

      // The query to get readings within a given interval.
      var whereClause = [
        'time > ? && time <= ? && read_point_id = ?',
        rounded,
        time,
        read_point_id
      ];

      // Execute the above query to get energy reading data.
      granularModel.model.findAll({
        where: whereClause
      }).success(function (consumptions) {
        // The statistics. Will be modified later if consumptions.length > 0.
        var statistics = {
          kwh: 0,
          kwh_mean: 0
        };

        // Populate the statistics.
        if (consumptions.length) {
          var kwhs = consumptions.map(function (consumption) {
            return consumption.values[granularModel.readingsPropertyName];
          });
          statistics.kwh_sum = kwhs.reduce(function (prev, curr) {
            return prev + curr;
          });
          statistics.kwh_mean = statistics.kwh_sum / kwhs.length;
          statistics.kwh_min = kwhs.slice().sort()[0];
          statistics.kwh_max = kwhs.slice().sort()[kwhs.length - 1];
        }

        // The query to get the single most recent piece of data from *this*
        // model. (Remember the above `findAll` call was to the lower
        // granularity model, **not** this model.)
        //
        // In case you are wondering where the time-based filtering is done,
        // then look no further; the time-based filtering is done in an
        // if-statement, below.
        //
        // TODO: figure out whether or not it is better to filter here, or to
        //   do so in the if-statement below.
        var query = {
          order: 'time DESC',
          where: [ 'read_point_id = ?', read_point_id ]
        }

        self.find(query).success(function (unitData) {

          // A helper function to collect the next set of data from the next
          // granularity.
          //
          // @param prevData Object is the instance object for what we retrieved
          //   currently.
          function collectNext(prevData) {
            // The parameters to the collectRecent function.
            var parameters = [
              {
                model: self,
                readingsPropertyName: 'kwh_sum'
              },
              prevData.values.time,
              read_point_id
            ];

            nextGranularity
            .collectRecent.apply(nextGranularity, parameters)
            .success(function (nextData) {
              def.resolve(nextData);
            }).error(function (err) {
              def.reject(err)
            });
          }

          // If the above query didn't get anything, or if the returned value is
          // much older than the maximum interval then this means that we
          // should add a new record to the database.
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
              read_point_id: read_point_id
            };

            self.create(
              _.assign(
                tableSpecificProperties,
                statistics
              )
            ).success(function (unitData) {
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
          })
          // TODO: merge error calls into a `complete` method call instead of
          //   `success`-`error` combo.
          .error(function (err) {
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
    return seq.define(tableName, {
      read_point_id: {
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
      kwh_mean: {
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
   *
   * @property model Object a sequelize model object.
   * @property maxRange Integer the maximum range that the model get when
   *   calling getEnergyReadings
   */

  var seriesCollection = {};

  (function () {

    var seriesCollectionMeta = {
      '1m': {
        interval: function() { return 1000 * 60 },
        nextGranularity: '5m',
        maxRange: 1000 * 60 * 60
      },
      '5m': {
        interval: function() { return 1000 * 60 *  5},
        nextGranularity: '1h',
        maxRange: 1000 * 60 * 60 * 2
      },
      '1h': {
        interval: function() { return 1000 * 60 * 60 },
        nextGranularity: '1d',
        maxRange: 1000 * 60 * 60 * 24
      },
      '1d': {
        interval: function () { return 1000 * 60 * 60 * 24 },
        nextGranularity: '1w',
        maxRange: 1000 * 60 * 60 * 24 * 14
      },
      '1w': {
        interval: function () {
          return sunday(new Date());
        },
        nextGranularity: '1mo',
        maxRange: 1000 * 60 * 60 * 24 * 7 * 4
      },
      '1mo': {
        interval: function ()  {
          return firstOfMonth(new Date());
        },
        nextGranularity: '1y',
        maxRange: 1000 * 60 * 60 * 24 * 365
      },
      '1y': {
        interval: function () {
          return firstOfYear(new Date());
        },
        maxRange: 1000 * 60 * 60 * 24 * 365 * 10
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
   * Holds information about energy usage by every single devices. This is
   * considered the "raw" energy readings.
   */

  var Reading = retval.Reading =
    seq.define('energy_consumptions', {
      // TODO: This is being defined from somewhere else as well. Have it be
      //   only defined from one place.
      read_point_id: {
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
        // TODO: move away from using `modelInstance.values.<property>`, to
        //   going to `modelInstance.<property>`.

        beforeValidate: function (consumption, callback) {
          var self = this;

          // Look for the most recent entry.
          //
          // We are omitting the interval because we only need the previous data
          // to compute the kWh difference from the current reading, and the
          // previous one.
          this.find({
            where: [ 'read_point_id = ?', consumption.read_point_id ],
            order: 'time DESC' })
          .success(function (prev) {
            if (prev) {
              // We want our data to be inserted in chronological order. Throw
              // an error if anything screws up.
              if (prev.values.time > reading.values.time) {
                var err = new Error(
                  'Current time: ' + reading.values.time + '\n' +
                  'Previous time: ' + prev.values.time + '\n\n' +
                  'Current time must be greater than previous time'
                );
                return callback(err);
              }

              reading.values.kwh_difference =
                reading.values.kwh - prev.values.kwh;
            } else {
              reading.values.kwh_difference = reading.values.kwh
            }

            callback(null, reading);
          }).error(callback);
        },
        afterCreate: function (reading, callback) {
          seriesCollection['1m'].model.collectRecent(
            {
              model: this,
              readingsPropertyName: 'kwh_difference'
            }, 
            reading.time,
            reading.read_point_id
          )
          .success(function () {
            callback(null, reading);
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
   *       "readings": {
   *         "energy_consumption": [
   *           {
   *             "remote_read_point_id": ...,
   *             "value": ...
   *           },
   *           ...
   *         ],
   *         "energy_production": [
   *           {
   *             "remote_read_point_id": ...,
   *             "value": ...
   *           }
   *         ],
   *         "water_use": [
   *           {
   *             "remote_read_point_id": ...,
   *             "value": ....
   *           },
   *         ],
   *         ...
   *       }
   *     }
   */

  // Note: Because this method is being overridden, it may mean that bugs may
  // arise. So far, there doesn't seem to be any, so let's keep this overridden.
  Reading.bulkCreate = function (data) {
    var self = this;
    var def = bluebird.defer();

    // Search for an ALIS device based on the provided UUID token and client
    // secret.
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
      // Loop through each energy consumption.
      async.map(data.energy_readings, function (reading, callback) {
        // An ALIS device can arbitrarily add or delete read points. Handle
        // it here.
        device.findOrCreateReadPoint(reading.id)
          .then(function (readPoint) {
            Reading.create({
              read_point_id: readPoint.id,
              time: data.time,
              kw: reading.kw,
              kwh: reading.kwh
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
      }, function (err, readings) {
        if (err) { return def.reject(err); }
        def.resolve(readings);
      });
    });
    return def.promise;
  };

  // Associations.

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