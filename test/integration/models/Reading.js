var sequelize = require('../../../models/seq');
var models = require('../../../models');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var async = require('async');

describe('Reading', function () {
  // We should, in theory, have a user and ALIS device.

  var user;
  var device;

  beforeEach(function (done) {
    sequelize.sync({
      force: true
    }).complete(function (err) {
      if (err) { throw err; }
      models.User.create({
        username: 'validusername',
        email_address: 'valid@example.com',
        password: 'keyboardcat'
      }).complete(function (err, u) {
        if (err) { throw err; }
        user = u;
        user.verify(
          user.verification_code,
          user.email_address
        ).then(function (u) {
          user = u;
          user.createALISDevice().complete(function (err, d) {
            device = d;
            done();
          });
        }).catch(function (err) {
          throw err;
        })
      })
    })
  });

  // TODO: test whether or not the correct energy consumers are returned.
  // TODO: test the data that is being read from two different ALIS devices.

  describe('bulkCreate', function () {
    xit('should create new meters on record, for each meter that don\'t exist on record', function (done) {
      var jsonstr = fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf8');
      jsonstr = _.template(jsonstr, {
        uuid_token: device.uuid_token,
        client_secret: device.client_secret
      });
      var readings = JSON.parse(jsonstr);
      async.each(readings, function (reading, callback) {
        models.Reading.bulkCreate(reading).then(function () {
          callback(null);
        }).catch(callback)
      }, function (err) {
        if (err) { throw err; }
      });
    });
  });
});