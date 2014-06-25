var sequelize = require('../../../models/seq');
var models = require('../../../models');
var expect = require('expect.js');
var async = require('async');
var UserALISDevice = models.UserALISDevice;

describe('UserALISDevice', function () {
  var user;
  beforeEach(function (done) {
    sequelize.sync({force: true}).complete(function (err) {
      if (err) { throw err; }
      models.User.create({
        username: 'janedoe',
        email_address: 'janedoe@example.com',
        password: 'keyboardcat'
      }).complete(function (err, u) {
        u.verify(u.verification_code, u.email_address).then(function (u) {
          user = u;
          done();
        }).catch(function (err) {
          throw err;
        });
      });
    });
  });

  describe('creation', function () {
    describe('createALISDevice', function () {
      it('should not create a new ALIS device, if the user is not verified', function (done) {
        models.User.create({
          username: 'johndoe',
          email_address: 'valid@email.com',
          password: 'keyboardcat'
        }).complete(function (err, user) {
          if (err) {
            throw err;
          }
          user.createALISDevice().complete(function (err, device) {
            expect(err.notVerified).to.be(true);
            done();
          });
        });
      });
      it('should create a new ALIS device, and set the user as it\'s owner', function (done) {
        user.createALISDevice().complete(function (err, device) {
          if (err) { throw err; }
          UserALISDevice.getOwner(device).then(function (u) {
            expect(u.id).to.be(user.id);
            done();
          }).catch(function (err) {
            throw err;
          });
        });
      });
      it('should be able to identify the user as the owner', function (done) {
        user.createALISDevice().complete(function (err, device) {
          if (err) { throw err; }
          UserALISDevice.isOwner(user, device).then(function (isOwner) {
            expect(isOwner).to.be(true);
            done();
          }).catch(function (err) {
            throw err;
          });
        })
      });
      it('should be able to reject a non owner as the owner', function (done) {
        models.User.create({
          username: 'cat',
          email_address: 'something@something.com',
          password: 'keyboardcat'
        }).complete(function (err, u) {
          if (err) { throw err; }
          user.createALISDevice().complete(function (err, device) {
            UserALISDevice.isOwner(u, device).then(function (result) {
              expect(result).to.be(false);
              done();
            }).catch(function (err) {
              throw err;
            })
          });
        });
      });
      it('should be able to reject null values passed in for an ownership check', function (done) {
        models.User.create({
          username: 'cat',
          email_address: 'something@something.com',
          password: 'keyboardcat'
        }).complete(function (err, u) {
          if (err) { throw err; }
          user.createALISDevice().complete(function (err, device) {
            UserALISDevice.isOwner(null, device).then(function (result) {
              expect(result).to.be(false);
              done();
            }).catch(function (err) {
              throw err;
            })
          });
        });
      });
      it('should allow the creation of an ALIS device, given a common name', function (done) {
        var commonName = 'My Awesome House';
        user.createALISDevice({
          common_name: commonName
        }).complete(function (err, device) {
          if (err) { throw err; }
          expect(device.common_name).to.be(commonName);
          done();
        });
      });
    });
  });

  describe('ALISDevice', function () {
    var user;
    beforeEach(function (done) {
      sequelize.sync({ force: true }).complete(function (err) {
        if (err) { throw err; };
        models.User.create({
          username: 'validusername',
          email_address: 'valid@example.com',
          password: 'keyboardcat'
        }).complete(function (err, u) {
          if (err) {
            throw err;
          }
          user = u;
          user.verify(
            user.verification_code,
            user.email_address
          ).then(function (user) {
            done();
          }).catch(function (err) {
            throw err;
          });
        });
      })
    });

    describe('getters', function () {
      describe('getMaintainers', function () {
        it('should get all maintainers, owner, admins, and limited a like', function (done) {
          async.parallel([
            function (callback) {
              models.User.create({
                username: 'johndoe',
                email_address: 'john@example.com',
                password: 'keyboardcat'
              }).complete(function (err, user) {
                if (err) { return callback(err); }
                user.verify(
                  user.verification_code,
                  user.email_address
                ).then(function (user) {
                  callback(null, user);
                }).catch(callback);
              });
            },
            function (callback) {
              models.User.create({
                username: 'janedoe',
                email_address: 'jane@example.come',
                password: 'keyboardcat'
              }).complete(function (err, user) {
                if (err) { return callback(err); }
                user.verify(
                  user.verification_code,
                  user.email_address
                ).then(function (user) {
                  callback(null, user);
                }).catch(callback);
              });
            }
          ], function (err, users) {
            user.createALISDevice().complete(function (err, device) {
              if (err) { throw err; }
              async.parallel([
                function (callback) {
                  UserALISDevice.grantAccessTo(user, users[0], device).then(function (user) {
                    callback(null)
                  }).catch(callback);
                },
                function (callback) {
                  UserALISDevice.grantAccessTo(user, users[1], device).then(function (user) {
                    callback(null)
                  }).catch(callback);
                }
              ], function (err, users) {
                if (err) { throw err; }
                UserALISDevice.getMaintainers(device).then(function (maintainers) {
                  expect(maintainers.length).to.be(3);
                  done();
                }).catch(function (err){
                  throw err;
                });
              })
            });
          });
        });
      });
      describe('isAdmin', function () {
        // TODO: this no longer uses a `isAdmin` function.
        it('should identify an owner as an admin', function (done) {
          user.createALISDevice().complete(function (err, device) {
            if (err) { throw err; }
            models.UserALISDevice.find({ where: [ 'user_id = ?', user.id] }).complete(function (err, join) {
              if (err) { throw err; }
              expect(join.privilege).to.be('owner');
              done();
            });
          });
        });
        xit('should identify an admin as an admin', function (done) {
          User.createALISDevice()
        });
      });
    });
  });

  xdescribe('grantAccessTo', function () {
    it('should allow an owner to give limited acces to a user, who otherwise didn\'t have any access', function (done) {
      models.User.create({
        username: 'johndoe',
        email_address: 'johndoe@example.com',
        password: 'keyboardcat'
      }).complete(function (err, user2) {
        if (err) { throw err; }
        user2.verify(
          user2.verification_code,
          user2.email_address
        ).then(function (user2) {
          user.createALISDevice().complete(function (err, device) {
            if (err) { throw err; }
            models.UserALISDevice.grantAccessTo(user, device).then(function () {
              models.UserALISDevice.hasAccess(user, device).then(function (join) {

                expect(result.user_id).to.be(user.id);

                done();
              }).catch(function (err) {
                throw err;
              });
            }).catch(function (err) {
              throw err;
            });
          });

        }).catch(function (err) {
          throw err;
        })
      });
    });
    it('should not give access to a user who hasn\'t been verified yet.', function (done) {
      models.User.create({
        username: 'johndoe',
        email_address: 'johndoe@example.com',
        password: 'keyboardcat'
      }).complete(function (err, user2) {
        if (err) { throw err; }
        user.createALISDevice().complete(function (err, device) {
          if (err) { throw err; }
          device.grantAccessTo(user, user2).then(function (user) {
            throw new Error('Should not have granted any access to the user');
          }).catch(function (err) {
            expect(err.notVerified).to.be(true);
            done();
          });
        });
      });
    });
  });

  describe('grantAdminAccessTo', function () {
    xit('should allow an owner to grant admin access to a maintainer', function () {
      throw new Error('Not yet specified.');
    });
  });
});