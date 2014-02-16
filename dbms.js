var express = require('express');
var settings = require('./settings');
var Sequelize = require('sequelize');
var async = require('async');

var sequelize = new Sequelize(
  settings.get('database').database,
  settings.get('database').username,
  settings.get('database').password,
  settings.get('database').sequelizeSettings
);

var models = require('./models').define(sequelize);

var app = express();

app.use(express.json());

app.get('/consumptions/:uuid', function (req, res, next) {
  async.parallel({
    user: function (callback) {
      models.User.find({
        where: [ 'api_key = ? AND client_secret = ?', req.query.api_key, req.query.client_secret ]
      }).complete(callback);
    },
    device: function (callback) {
      models.ALISDevice.find({
        where: [ 'uuid_token = ?', req.params.uuid ]
      }).complete(callback);
    }
  }, function (err, result) {
    if (err) { return next(err); }
    result.device.isOwner(result.user).then(function (isOwner) {
      if (!isOwner) {
        return res.send(403, 'You are not allowed to view this data.');
      }
      // TODO: sanitize the query.
      result.device.getEnergyReadings(req.query).then(function (readings) {
        res.json(readings);
      }).catch(next);
    });
  });
});

/*
 * Accepts:
 *
 * {
 *   uuid_token: string representing a unique ID in the database.
 *   client_secret: string representing a secret key, associated to a specific
 *     ALIS device.
 *   time: a JavaScript time object
 *   energy_consumptions: [
 *     {
 *       id: a unique ID of all the devices in the database
 *       kw: a floating point number
 *       kwh: a floating point number.
 *     }
 *   ]
 * }
 */

app.post('/consumptions', function (req, res, next) {
  models.EnergyConsumptions.bulkCreate(req.body).then(function () {
    res.send('Success!');
  }).catch(next);
});

app.use(function (err, req, res, next) {
  if (err instanceof models.ValidationErrors) {
    return res.send(400, err.message);
  }
  return next(err);
});

app.use(function (err, req, res, next) {
  console.log(err.device_id);
  return next(err);
});

models.prepare(function () {
  app.listen(settings.get('dbms:port'), function () {
    console.log('App: DBMS');
    console.log('Port:', this.address().port);
    console.log('Mode:', settings.get('environment'));
  });
});
