var sequelize = require('../../../models/seq');
var models = require('../../../models');
var User = models.User;
var UserALISDevice = models.UserALISDevice;
var expect = require('expect.js');
var ALISDevice = models.ALISDevice;
var uuid = require('node-uuid');
var validator = require('validator');

describe('ALISDevice', function () {
  var user;

  beforeEach(function (done) {
    sequelize
      .sync({ force: true })
      .success(function () {
        User
          .create({
            username: 'something',
            full_name: 'Jane Smith',
            email_address: 'jane@example.ca',
            password: 'keyboardcat'
          })
          .success(function (u) {
            user = u;
            user.verify(
              user.verification_code,
              user.email_address
            ).then(function (user) {
              done();
            }).catch(function (err) {
              throw err;
            });
          })
          .error(function (err) {
            throw err;
          });
      })
      .error(function (err) {
        console.error(err);
        throw err;
      });
  });

  describe('creation', function () {
    it('should create a new ALIS device, with a UUID token and "client secret"', function (done) {
      ALISDevice
        .create({})
        .success(function (alisDevice) {
          expect(validator.isUUID(alisDevice.values.uuid_token, 4)).to.be(true);
          expect(typeof alisDevice.values.client_secret).to.be('string');
          user
            .addALISDevice(alisDevice)
            .success(function () {
              user
                .hasALISDevice(alisDevice)
                .success(function (result) {
                  expect(result).to.be(true);
                  done();
                })
                .failure(function (err) {
                  throw err;
                });
            })
            .error(function (err) {
              throw err;
            });
        })
        .error(function (err) {
          throw err;
        });
    });
  });

  describe('modification', function () {
    it('should not allow the modification of the UUID', function (done) {
      ALISDevice.create({})
        .complete(function (err, alisDevice) {
          if (err) {
            throw err;
          }

          alisDevice.updateAttributes({
            uuid_token: uuid.v4()
          }).complete(function (err) {
            expect(typeof err.message).to.be('string');
            done();
          })
        });
    });

    xdescribe('privilege', function () {
      it('should be able to change privileges', function (done) {
        ALISDevice.create({}).complete(function (err, alisDevice) {
          if (err) {
            throw err;
          }

          alisDevice.setOwner(user).then(function () {
            done();
          }).catch(function (e) {
            throw e;
          });
        });
      });
    });
  });

  describe('findOrCreateReadPoint', function () {
    it('should create a consumer, if one wasn\'t found', function (done) {
      user.createALISDevice().complete(function (err, alisDevice) {
        if (err) { throw err; }
        var readPointId = 'hello,world';
        alisDevice.findOrCreateReadPoint(readPointId).then(function (consumer) {
          alisDevice.getReadPoints().complete(function (err, consumers) {
            if (err) { throw err; }
            expect(consumers[0].remote_read_point_id).to.be(readPointId);
            done();
          });
        }).catch(function (err) {
          throw err;
        })
      });
    });

    it('should find a consumer, if one was found', function (done) {
      user.createALISDevice().complete(function (err, alisDevice) {
        if (err) { throw err; }
        var readPointId = 'hello,world';
        alisDevice.findOrCreateReadPoint(readPointId).then(function (consumer) {
          alisDevice.getReadPoints().complete(function (err, consumers) {
            if (err) { throw err; }
            alisDevice
              .findOrCreateReadPoint(consumers[0].remote_read_point_id)
              .then(function (consumer) {
                expect(consumers[0].remote_read_point_id).to.be(readPointId);
                done();
              })
              .catch(function (err) {
                throw err;
              })
          });
        }).catch(function (err) {
          throw err;
        })
      });
    });
  });
});