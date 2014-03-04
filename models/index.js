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

// TODO: rename "ALISDevice" to hub.

/*
 * Floor to the nearest interval of a given date object. E.g. 12:32 will be
 * floored to 12:30 if the interval was 1000 * 60 * 5 = 5 minutes.
 */

var roundTime = module.exports.roundTime = function roundTime(date, coeff) {
  var retval = new Date(Math.floor(date.getTime() / coeff) * coeff);
  return retval;
};

var roundTimeFunc = module.exports.roundTimeFunc = function roundTimeFunc(coeff) {
  return function (date) {
    return roundTime(date, coeff);
  };
}

// TODO: implement this.
var sunday = module.exports.sunday = function sinceSunday(date) {
  var dayInMillisecond = 1000 * 60 * 60 * 24;
  var midnight = roundTime(date, dayInMillisecond);
  return new Date(midnight.getTime() - midnight.getUTCDay() * dayInMillisecond);
};

// TODO: implement this.
var firstOfMonth = module.exports.firstOfMonth = function sinceFirstOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

// TODO: implement this.
var firstOfYear = module.exports.firstOfYear = function sinceFirstOfYear(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
};

var seq = module.exports.seq = require('./seq');


// This is where we will be storing our model classes.
//var retval = {};

var Meter = module.exports.Meter = require('./Meter');
var UserALISDevice = module.exports.UserALISDevice = require('./UserALISDevice');
var ALISDevice = module.exports.ALISDevice = require('./ALISDevice');
var User = module.exports.User = require('./User');

// TODO: move these association calls elsewhere.

User.hasMany(ALISDevice, {
  as: 'ALISDevice',
  through: UserALISDevice,
  foreignKey: 'user_id'
});

ALISDevice.hasMany(Meter, {
  as: 'Meters',
  foreignKey: 'alis_device_id'
});

ALISDevice.hasMany(User, {
  as: 'User',
  through: UserALISDevice,
  foreignKey: 'alis_device_id'
});


/*
 * Generates a model.
 *
 * A model is what will be used for storing and retrieving data in a particular
 * time-series granularity.
 */

function createModel(timeCode, lowerGranularModels) {
  lowerGranularModels = lowerGranularModels || [];
  return seq.define('readings_' + timeCode, {
    meter_id: {
      type: Sequelize.INTEGER(11),
      validate: {
        notNull: true
      }
    },
    time: {
      type: Sequelize.DATE,
      notNull: true
    },
    sum: {
      type: Sequelize.FLOAT,
      defaultValue: 0
    },
    mean: {
      type: Sequelize.FLOAT,
      defaultValue: 0
    },
    min: Sequelize.FLOAT,
    max: Sequelize.FLOAT,
  }, {
    freezeTableName: true,
    timestamps: false,
    hooks: {
      afterCreate: createCollector(lowerGranularModels)
    }
  });
}

function createCollector(lowerGranularModels) {
  return function (reading, callback) {
    var self = this;
    async.each(lowerGranularModels, function (model, callback) {
      collect(
        reading,
        self,
        model.model,
        model.intervalFunction
      ).then(function () {
        callback(null);
      }).catch(function (err) {callback(err);});
    }, function (err) {
      if (err) { return callback(err); }
      callback(null, reading);
    });
  }
}

/*
 * @param instance Object is an instance of the granular data, lower than that
 *   we are cascading to.
 * @param instanceModel Object is the model that represents `instance`
 * @param model Object is the model that we are going to cascading to
 * @param intervalFunction Function is the function that will retrieve the
 *   interval from which to get the data from.
 */

function collect(instance, instanceModel, model, intervalFunction) {
  var def = bluebird.defer();
  var rounded = Math.floor(
    intervalFunction(instance.time).getTime() / 1000
  );
  instanceModel.findAll({
    where: [
      'time > FROM_UNIXTIME(?) && time <= FROM_UNIXTIME(?) && meter_id = ?',
      rounded,
      Math.floor(instance.time.getTime() / 1000),
      instance.meter_id
    ]
  }).complete(function (err, readings) {
    if (err) { return callback(err); }
    if (!readings.length) {
      readings = [{
        meter_id: instance.meter_id,
        time: new Date(rounded * 1000),
        sum: 0,
        mean: 0,
        min: 0,
        max: 0
      }];
    }
    var data = readings.reduce(function (prev, curr) {
      return {
        meter_id: prev.meter_id,
        time: new Date(rounded * 1000),
        sum: prev.sum + curr.sum,
        mean:  (prev.mean + curr.mean) / 2,
        min: Math.min(prev.min, curr.min),
        max: Math.max(prev.max, curr.max)
      }
    }, {
      meter_id: instance.meter_id,
      time: new Date(rounded * 1000),
      sum: readings[0].sum,
      mean: readings[0].mean,
      min: readings[0].min,
      max: readings[0].max
    });
    model.find({
      where: [ 'time = FROM_UNIXTIME(?) AND meter_id = ?', rounded, readings[0].meter_id ]
    }).complete(function (err, reading) {
      if (err) { return callback(err); }
      if (!reading) {
        return model.create(data).then(function (reading) {
          def.resolve(reading);
        }).catch(function (err) {
          // // TODO: err can actually represent an error, even if it is not an
          // //   instance of an error. Handle such an event.
          // if (!(err instanceof Error)) { return def.resolve(err); }
          def.reject(err);
        });
      }
      reading.updateAttributes(data).complete(function (err, reading) {
        if (!(err instanceof Error)) { return def.resolve(err); }
        if (err) { return def.reject(err); }
        def.resolve(reading);
      });
    });
  });
  return def.promise;
}

var Readings1y = createModel('1y');
var Readings1mo = createModel('1mo');
var Readings1w = createModel('1w');
var Readings1d = createModel(
  '1d',
  [
    {
      model: Readings1w,
      intervalFunction: sunday
    },
    {
      model: Readings1mo,
      intervalFunction: firstOfMonth
    },
    {
      model: Readings1y,
      intervalFunction: firstOfYear
    }
  ]
)
var Readings1h = createModel(
  '1h',
  [
    {
      model: Readings1d,
      intervalFunction: roundTimeFunc(1000 * 60 * 60 * 24)
    }
  ]
)
var Readings5m = createModel(
  '5m',
  [
    {
      model: Readings1h,
      intervalFunction: roundTimeFunc(1000 * 60 * 60)
    }
  ]
)
var Readings1m = createModel(
  '1m',
  [
    {
      model: Readings5m,
      intervalFunction: roundTimeFunc(1000 * 60 * 5)
    }
  ]
);

/*
 * Holds information about energy usage by every single devices. This is
 * considered the "raw" energy readings.
 */

var Reading = module.exports.Reading =
  seq.define('readings', {
    // TODO: This is being defined from somewhere else as well. Have it be
    //   only defined from one place.
    meter_id: {
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

    value: {
      type: Sequelize.FLOAT,
      defaultValue: 0
    }

  }, {
    freezeTableName: true,
    timestamps: false,
    hooks: {
      afterCreate: function (reading, callback) {
        var rounded = Math.floor(roundTime(reading.time, 1000 * 60).getTime() / 1000);
        //console.log(rounded);
        //console.log(new Date(rounded * 1000));
        this.findAll({
          where: [
            'time > FROM_UNIXTIME(?) && time <= FROM_UNIXTIME(?) && meter_id = ?',
            rounded,
            Math.floor(reading.time.getTime() / 1000),
            reading.meter_id
          ]
        }).complete(function (err, readings) {
          if (err) { return callback(err); }
          var data = readings.reduce(function (prev, curr) {
            return {
              meter_id: prev.meter_id,
              // TODO: this shoulded really need to be here.
              time: new Date(rounded * 1000),
              sum: prev.sum + curr.value,
              mean: (prev.mean + curr.value) / 2,
              min: Math.min(prev.min, curr.value),
              max: Math.max(prev.max, curr.value)
            }
          }, {
            meter_id: readings[0].meter_id,
            time: new Date(rounded * 1000),
            sum: readings[0].value,
            mean: readings[0].value,
            min: readings[0].value,
            max: readings[0].value
          });
          Readings1m.find({
            where: [ 'time = FROM_UNIXTIME(?) AND meter_id = ?', rounded, reading.meter_id ]
          }).complete(function (err, reading1m) {
            if (err) { return callback(err); }

            function doneWriting(err, reading1m) {
              err && console.log(data);
              if (err) { return callback(err); }
              callback(null, reading);
            }

            if (!reading1m) {
              return Readings1m.create(data).complete(doneWriting);
            }
            reading1m.updateAttributes(data).complete(doneWriting);
          });
        });
      }
    }
  });

var EnergyConsumption = module.exports.EnergyConsumption =
  seq.define('energy_consumptions', {
    meter_id: {
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

        // Find the most recently entered energy consumption data.
        this.find({
          where: [
            'meter_id = ?',
            consumption.meter_id
          ],
          order: 'time DESC'
        }).complete(function (err, prevConsumption) {
          if (err) { return callback(err); }
          prevConsumption = prevConsumption || { kwh: 0 }
          // Insert a new piece of consumption data.
          consumption.kwh_difference = consumption.kwh - prevConsumption.kwh;
          // console.log(consumption.values);
          callback(null, consumption);
        });
      }
    }
  })

/*
 * Creates energy readings in the database, and converts the current kwh reading
 * into a difference since the last reading.
 *
 * The data takes on the format of
 *
 *     {
 *       "time": ...,
 *       "uuid_token": ...,
 *       "client_secret": ...,
 *       "consumptions": [
 *         {
 *           "id": ...,
 *           "kw": ...,
 *           "kwh": ...
 *         }
 *       ]
 *     }
 */

var createAndParseEnergyReadings = module.exports.createAndParseEnergyReadings = function (data) {
  var def = bluebird.defer();

  // Find the hub that is sending us the data.
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

    // Loop through each consumption, and return data that can be parsed by the
    // `Reading.bulkCreate` function, below.
    async.map(data.consumptions, function (consumption, callback) {
      // Look for a meter associated with the ALISDevice.
      device.findOrCreateMeter({
        remote_meter_id: consumption.id,
        type: 'energy_consumption'
      }).then(function (meter) {
        if (err) { return callback(err); }
        var retval = {
          meter_id: meter.id,
          time: data.time,
          kw: consumption.kw,
          kwh: consumption.kwh
        };
        // console.log(retval);
        EnergyConsumption.create(retval).complete(function (err, consumption) {
          if (err) { return callback(err); }
          callback(null, {
            remote_meter_id: consumption.meter_id,
            value: consumption.kwh_difference
          });
        });
      }).catch(function (err) {
        def.reject(err);
      });
    }, function (err, consumptions) {
      if (err) { return def.reject(err); }
      def.resolve({
        time: data.time,
        uuid_token: data.uuid_token,
        client_secret: data.client_secret,
        readings: consumptions
      });
    });
  });

  return def.promise;
};

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
 *             "id": ...,
 *             "value": ...
 *           },
 *           ...
 *         ],
 *         "energy_production": [
 *           {
 *             "id": ...,
 *             "value": ...
 *           },
 *           ...
 *         ],
 *         "water_use": [
 *           {
 *             "id": ...,
 *             "value": ....
 *           },
 *           ...
 *         ],
 *         ...
 *       }
 *     }
 *
 * Note: it is absolutely not required that we have a `energy_consumption`,
 * `energy_production`, or `water_use` property. In fact, we are not even
 * to those types of readings. Many more are possible.
 */

// Note: Because this method is being overridden, it may mean that bugs may
// arise. So far, there doesn't seem to be any, so let's keep this overridden.
Reading.bulkCreate = function (data) {
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
      return def.reject(new Error('An ALIS device with the given UUID tken and client secret not found'));
    }
    // Loop through each types of readings.
    var keys = Object.keys(data.readings);
    async.each(keys, function (key, callback) {
      var readings = data.readings[key];
      // Loop through each readings, in each types of readings.
      async.forEach(readings, function (reading, callback) {
        // Look for a meter with the given meter ID and type (or create it if
        // it doesn't exist).
        var properties = {
          remote_meter_id: reading.id,
          type: key
        };
        device.findOrCreateMeter(properties).then(function (meter) {
          if (err) { return callback(err); }
          // Create a new reading record in the database.
          // TODO: cascade to a lower granularity.
          Reading.create({
            meter_id: meter.id,
            time: data.time,
            value: reading.value
          }).complete(function (err, reading) {
            if (err) { return callback(err); }
            callback(null);
          });
        }).catch(function (err) {
          throw err;
        });
      }, function (err) {
        if (err) {
          return callback(err);
        }
        callback(null);
      });
    }, function (err) {
      if (err) { return def.reject(err); }
      def.resolve()
    });
  });

  return def.promise;
};

/*
 * This synchronizes the database when specified. Otherwise, ends the function
 * when no syncrhonizations required.
 */

module.exports.prepare = function (callback) {
  if (settings.get('database:sync')) {
    console.log('Synchronizing');
    if (!!settings.get('database:forceSync')) {
      console.log('Dropping all tables');
    }
    seq
      .sync({ force: !!settings.get('database:forceSync') })
      .complete(function (err) {
        if (err) { throw err; }
        callback();
      });
  } else {
    process.nextTick(callback);
  }
}