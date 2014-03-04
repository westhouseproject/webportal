var Sequelize = require('sequelize');
var seq = require('./seq');
var bluebird = require('bluebird');

// TODO: set a custom primary key for both the users and alis_device tables.

/*
 * The devices that consume energy.
 */

module.exports = seq.define('meters', {
  type: {
    type: Sequelize.STRING,
    allowNull: false
  },
  name: Sequelize.STRING,
  /*
   * This is the unique identifier represented by the ALIS device.
   */
  remote_meter_id: {
    type: Sequelize.STRING,
    allowNull: false
  }
}, {
  classMethods: {
    getTypes: function () {
      var def = bluebird.defer();
      seq
        .query('SELECT DISTINCT type FROM meters', this)
        .complete(function (err, meters) {
          if (err) { return def.reject(err); }
          def.resolve(meters.map(function (meter) {
            return meter.type;
          }));
        });
      return def.promise;
    }
  }
});
