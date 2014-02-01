var Sequelize = require('sequelize');
var settings = require('./settings');

var sequelize = new Sequelize(
  settings.get('database:database'),
  settings.get('database:username'),
  settings.get('database:password'),
  settings.get('database:sequelizeSettings')
);

var User = module.exports.User = sequelize.define('user', {
  // This represnts the Twitter ID, and not the Twitter handle.
  twitter_id: Sequelize.STRING,

  full_name: Sequelize.STRING,

  email_address: Sequelize.STRING
}, {

});

/*
 * Connect to the database.
 */

module.exports.connect = function (callback) {
  if (settings.get('database:sync')) {
    return sequelize
      .sync({ force: true })
      .success(function () {
        callback(null);
      })
      .error(callback);
  }

  process.nextTick(callback);
};