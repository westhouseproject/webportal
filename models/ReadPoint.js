var Sequelize = require('sequelize');
var seq = require('./seq');

// TODO: set a custom primary key for both the users and alis_device tables.


/*
 * The devices that consume energy.
 */

module.exports = seq.define('read_point', {
  name: Sequelize.STRING,
  /*
   * This is the unique identifier represented by the ALIS device.
   */
  remote_read_point_id: {
    type: Sequelize.STRING,
    allowNull: false
  }
});
