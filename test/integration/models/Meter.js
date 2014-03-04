var sequelize = require('../../../models/seq');
var models = require('../../../models');
var expect = require('expect.js');
var async = require('async');
var UserALISDevice = models.UserALISDevice;

describe('Meter', function () {
  var user;
  var device;
  beforeEach(function (done) {
    sequelize.sync({ force: true }).complete(function (err) {
      if (err) { throw err; }
      models.User.create({
        username: 'janedoe',
        email_address: 'janedoe@example.com',
        password: 'keyboardcat'
      }).complete(function (err, u) {
        u.verify(u.verification_code, u.email_address).then(function (u) {
          user = u;
          user.createALISDevice().complete(function (err, d) {
            device = d;
            done();
          });
        }).catch(function (err) {
          throw err;
        });
      });
    });
  });

  describe('getTypes', function () {
    it('should get the different types of data available', function (done) {
      var meters = [
        {
          type: 'energy_consumption',
          remote_meter_id: 'one'
        },
        {
          type: 'energy_consumption',
          remote_meter_id: 'two'
        },
        {
          type: 'energy_consumption',
          remote_meter_id: 'three'
        },
        {
          type: 'energy_production',
          remote_meter_id: 'one'
        },
        {
          type: 'energy_production',
          remote_meter_id: 'two'
        },
        {
          type: 'energy_production',
          remote_meter_id: 'three'
        },
        {
          type: 'water_use',
          remote_meter_id: 'one'
        },
        {
          type: 'water_use',
          remote_meter_id: 'two'
        },
        {
          type: 'water_use',
          remote_meter_id: 'three'
        }
      ];
      async.each(meters, function (meter, callback) {
        models.Meter.create(meter).complete(callback);
      }, function (err) {
        if (err) { throw err; }
        models.Meter.getTypes().then(function (types) {
          expect(types.length).to.be(3);
          types.forEach(function (type) {
            expect(type).to.be.a('string');
          });
          done();
        }).catch(function (err) {
          throw err;
        })
      });
    });
  });
});