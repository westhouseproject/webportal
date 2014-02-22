var Sequelize = require('sequelize');

var settings = require('../settings');

module.exports = new Sequelize(
  settings.get('database:database') || 'test',
  settings.get('database:username') || 'root',
  settings.get('database:password') || 'root',
  settings.get('database:sequelizeSettings') || {
    host: '127.0.0.1',
    port: 3306
  }
);