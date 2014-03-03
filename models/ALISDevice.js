var Sequelize = require('sequelize');
var uuid = require('node-uuid');
var crypto = require('crypto');
var bluebird = require('bluebird');
var seq = require('./seq');
var Meter = require('./Meter');

/*
 * Represents an ALIS device.
 */

// TODO: find a way to gracefully regenerate a new UUID if one already
//   existed.

module.exports = seq.define('alis_device', {
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
    // getOwner: function () {
    //   var def = bluebird.defer();
    //   UserALISDevice.find({
    //     where: [ 'alis_device_id = ? AND privilege = ?', this.id, 'owner' ]
    //   }).complete(function (err, join) {
    //     if (err) { def.reject(err); }
    //     if (!join) {
    //       return def.resolve(null);
    //     }
    //     UserALISDevice.findUser().complete(function (err, user) {
    //       if (err) {
    //         return def.reject(err);
    //       }
    //       def.resolve(user);
    //     });
    //   });
    //   return def.promise;
    // },

    // isOwner: function (user) {
    //   var def = bluebird.defer();
    //   if (!user) {
    //     process.nextTick(function () {
    //       def.resolve(false);
    //     });
    //   } else {
    //     this.getOwner().then(function (u) {
    //       def.resolve(u.id === user.id);
    //     }).catch(function (err) {
    //       def.reject(err);
    //     });
    //   }
    //   return def.promise;
    // },

    // isAdmin: function (user) {
    //   var def = bluebird.defer();
    //   UserALISDevice.find({
    //     where: [
    //       'alis_device_id = ? AND user_id = ? AND (privilege = ? OR privilege = ?)',
    //       this.id,
    //       user.id,
    //       'admin',
    //       'owner'
    //     ]
    //   }).complete(function (err, user) {
    //     if (err) { return def.reject(err); }
    //     def.resolve(!!user);
    //   });
    //   return def.promise;
    // },

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

    // grantAccessTo: function (admin, user) {
    //   var def = bluebird.defer();
    //   var self = this;
    //   this.isAdmin(admin).then(function (result) {
    //     if (!result) {
    //       def.reject(new Error('The user is not an admin.'));
    //     }
    //     UserALISDevice.create({
    //       user_id: user.id,
    //       alis_device_id: self.id,
    //       adminUserID: admin.id
    //     }).complete(function (err, join) {
    //       if (err) { def.reject(err); }
    //       def.resolve(user);
    //     });
    //   }).catch(function (err) {
    //     def.reject(err);
    //   });
    //   return def.promise;
    // },

    revokeAccessFrom: function (admin, user) {
      var def = bluebird.defer();
      process.nextTick(function () {
        def.reject(new Error('Not yet implemented'));
      });
      return def.promise;
    },

    findOrCreateMeter: function (options) {
      var def = bluebird.defer();
      var self = this;
      this.getMeters({
        where: [ 'remote_meter_id = ? AND type = ?', options.remote_meter_id, options.type ]
      }).complete(function (err, meters) {
        if (err) { return def.reject(err); }
        if (meters[0]) { return def.resolve(meters[0]); }
        self.createMeter({
          remote_meter_id: options.remote_meter_id,
          type: options.type
        }).complete(function (err, meter) {
          if (err) { def.reject(err); }
          def.resolve(meter);
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

      Reading.findAll({
        where: [
          'UNIX_TIMESTAMP(time) > ? AND UNIX_TIMESTAMP(time) < ?',
          options.from,
          options.to
        ],
        order: 'time DESC',
      }).complete(function (err, consumptions) {
        if (err) { return def.reject(err); }

        if (!readings.length) {
          return def.resolve(readings);
        }

        readings = readings.map(function (reading) {
          return {
            id: reading.read_point_id,
            time: reading.time,
            kw: reading.kw,
            kwh: reading.kwh,
            kwh_difference: reading.kwh_difference
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
            id: consumption.read_point_id,
            time: consumption.time,
            kwh_sum: consumption.kwh_sum,
            kwh_mean: consumption.kwh_mean,
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
                kwh_mean: 0,
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
            kwh_mean: c.kwh_mean == null || isNaN(c.kwh_mean) ? 0 : c.kwh_mean,
            kwh_min: c.kwh_min == null || isNaN(c.kwh_min) ? 0 : c.kwh_min,
            kwh_max: c.kwh_max == null || isNaN(c.kwh_max) ? 0 : c.kwh_max
          };
          return keys.reduce(function (prev, curr) {
            var c = consumptions[curr][i];
            var current = {
              time: c.time,
              kwh_sum: c.kwh_sum == null || isNaN(c.kwh_sum) ? 0 : c.kwh_sum,
              kwh_mean: c.kwh_mean == null || isNaN(c.kwh_mean) ? 0 : c.kwh_mean,
              kwh_min: c.kwh_min == null || isNaN(c.kwh_min) ? 0 : c.kwh_min,
              kwh_max: c.kwh_max == null || isNaN(c.kwh_max) ? 0 : c.kwh_max
            };

            var retval = {
              time: prev.time,
              kwh_sum: prev.kwh_sum + current.kwh_sum,
              kwh_mean: prev.kwh_mean + current.kwh_mean,
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
