var Sequelize = require('sequelize');
var fs = require('fs');
var expect = require('expect.js');
var validator = require('validator');
var uuid = require('node-uuid');
var async = require('async');

var settings = {};
try {
  settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
} catch (e) {}

describe('integration tests', function () {
  var sequelize;
  var models;
  var ALISDevice;
  var User;
  before(function (done) {
    sequelize = new Sequelize(
      settings.database || 'testing',
      settings.username || 'root',
      settings.password || 'root',
      settings.sequelizeSettings || {
        host: '127.0.0.1'
      }
    );
    models = require('./models').define(sequelize);
    ALISDevice = models.ALISDevice;
    User = models.User;
    done();
  });

  describe('User', function () {
    beforeEach(function (done) {
      sequelize
        .sync({ force: true })
        .complete(function (err) {
          if (err) {
            throw err;
          }
          done();
        });
    });

    describe('creation', function () {
      describe('username', function () {
        // TODO: test whether or not an error is thrown if the username's length
        //   is not within the range.

        it('should not allow the creation of users with null usernames', function (done) {
          models
            .User
            .create({
              email_address: 'valid@example.com',
              password: 'keyboardcat'
            })
            .complete(function (err, user) {
              expect(err != null).to.be(true);
              expect(err.username != null).to.be(true);
              done();
            });
        });

        it('should not allow the creation of users with invalid usernames', function (done) {
          models
            .User
            .create({
              username: 'invalid username',
              email_address: 'valid@example.com',
              password: 'keyboardcat'
            })
            .complete(function (err, user) {
              expect(err != null).to.be(true);
              expect(err.username != null).to.be(true);
              done();
            });
        });

        it('should not allow a user to create an account that has a username already taken', function (done) {
          var existingUsername = 'validusername';
          models
            .User
            .create({
              username: existingUsername,
              email_address: 'valid@example.com',
              password: 'keyboardcat'
            })
            .complete(function (err, user) {
              if (err) { throw err; }
              models
                .User
                .create({
                  username: existingUsername,
                  email_address: 'valid2@example.com',
                  password: 'keyboardcat'
                })
                .complete(function (err, user) {
                  expect(err != null).to.be(true);
                  expect(err.code).to.be('ER_DUP_ENTRY');
                  done();
                });
            });
        });

        it('should downcase the username', function (done) {
          var username = 'CamelCase';
          models
            .User
            .create({
              username: username,
              email_address: 'valid@example.com',
              password: 'keyboardcat'
            })
            .complete(function (err, user) {
              expect(user.username).to.be(username.toLowerCase());
              expect(user.chosen_username).to.be(username);
              done();
            });
        });
      });

      describe('email_address', function () { 
        it('should allow the creation of user with a valid email address', function (done) {
          var emailAddress = 'valid@example.com'
          models
            .User
            .create({
              username: 'validusername',
              password: 'keyboardcat',
              email_address: emailAddress
            })
            .complete(function (err, user) {
              if (err) { throw err; }
              expect(user.email_address).to.be(emailAddress);
              done();
            });
        });

        it('should not allow the creation of a user with a duplicate email address', function (done) {
          var existingEmailAddress = 'valid@example.com';
          models
            .User
            .create({
              username: 'validusername',
              password: 'keyboardcat',
              email_address: existingEmailAddress
            })
            .complete(function (err, user) {
              if (err) { throw err; }
              models
                .User
                .create({
                  username: 'anothername',
                  password: 'keyboardcat',
                  email_address: existingEmailAddress
                })
                .complete(function (err, user) {
                  expect(err != null).to.be(true);
                  expect(err.code).to.be('ER_DUP_ENTRY');
                  done();
                });
            })
        });

        it('should not allow the creation of users with null email addresses', function (done) {
          models
            .User
            .create({
              username: 'validusername',
              password: 'keyboardcat'
            })
            .complete(function (err, user) {
              expect(err != null).to.be(true);
              done();
            })
        });

        it('should not allow the creation of users with invalid email addresses', function (done) {
          models
            .User
            .create({
              username: 'validusername',
              email_address: 'asldjflsdjf flkjasdlfjsaldfjs',
              password: 'keyboardcat'
            })
            .complete(function (err, user) {
              expect(err != null).to.be(true);
              done();
            });
        });
      });

      describe('password', function () {
        it('should hash a valid password', function (done) {
          var password = 'keyboardcat'
          models
            .User
            .create({
              username: 'validusername',
              email_address: 'valid@example.com',
              password: password
            })
            .complete(function (err, user) {
              if (err) {
                throw err;
              }
              expect(user.password).to.not.be(password);
              done();
            });
        })

        it('should not allow the creation of a password less than 6 characters', function (done) {
          models
            .User
            .create({
              username: 'validusername',
              email_address: 'valid@example.com',
              password: 'a'
            })
            .complete(function (err, user) {
              expect(err != null).to.be(true);
              done();
            });
        });

        it('should not allow the creation of a null password', function (done) {
          models
            .User
            .create({
              username: 'validusername',
              email_address: 'valid@example.com'
            })
            .complete(function (err, user) {
              expect(err != null).to.be(true);
              done();
            });
        });
      });

      describe('verification', function () {
        it('should create a verification code', function (done) {

          models
            .User
            .create({
              username: 'validusername',
              password: 'keyboardcat',
              email_address: 'valid@example.com'
            })
            .complete(function (err, user) {
              if (err) { throw err; }
              expect(validator.isUUID(user.verification_code), 4)
                .to.be(true);
              expect(user.isVerified()).to.be(false);
              done();
            });
        });
      });
    });

    describe('modification', function () {
      describe('full_name', function () {
        it('should allow for the modification of valid full name', function (done) {
          models.User
            .create({
              username: 'validusername',
              email_address: 'valid@example.com',
              password: 'keyboardcat',
            })
            .complete(function (err, user) {
              if (err) { throw err; }

              var name1 = 'Jane Smith';

              user
                .updateAttributes({
                  full_name: name1
                })
                .complete(function (err, user) {
                  if (err) {
                    throw err;
                  }

                  expect(user.full_name).to.be(name1);

                  var name2 = 'John Doe';

                  user
                    .updateAttributes({
                      full_name: name2
                    })
                    .complete(function (err, user) {
                      if (err) {
                        throw err;
                      }

                      expect(user.full_name).to.be(name2);

                      done();
                    });
                });
            });
        });
      });

      // TODO: test the modification of an email address.

      it('should always set the username as lowercase', function (done) {
        models
          .User
          .create({
            username: 'lowercase',
            password: 'keyboardcat',
            email_address: 'valid@example.com'
          })
          .complete(function (err, user) {
            if (err) { throw err; }

            var newUsername = 'UPPERCASE';

            models.User.find(user.id).complete(function (err, user) {
              if (err) { throw err; }
              if (!user) { throw new Error('No user found'); }
              user
                .updateAttributes({ username: newUsername })
                .complete(function (err, user) {
                  if (err) { throw err; }
                  expect(user.username).to.be(newUsername.toLowerCase());
                  expect(user.chosen_username).to.be(newUsername);
                  done();
                })
            });
          });
      });

      it('should not allow the modification of a username, so that two users have the same username', function (done) {
        models
          .User
          .create({
            username: 'someone',
            password: 'keyboardcat',
            email_address: 'valid1@example.com'
          })
          .complete(function (err, user1) {
            if (err) { throw err; }
            models
              .User
              .create({
                username: 'another',
                password: 'keyboardcat',
                email_address: 'valid2@example.com'
              })
              .complete(function (err, user2) {
                if (err) { throw err; }
                user2
                  .updateAttributes({
                    username: 'someone'
                  })
                  .complete(function (err, user2) {
                    expect(err != null).to.be(true);
                    expect(err[0].code).to.be('ER_DUP_ENTRY');
                    done();
                  })
              })
          })
      });

      describe('verification', function () {
        it('should not verify a user given a non-matching verification code', function (done) {
          models.User.create({
            username: 'validusername',
            email_address: 'valid@example.com',
            password: 'keyboardcat'
          }).complete(function (err, user) {
            if (err) { throw err; }
            user.verify(
              'lkasdjfkljas',
              user.email_address
            ).then(function (user) {
              expect(user.isVerified()).to.be(false);
              done();
            }).catch(function (err) {
              expect(err.notVerified).to.be(true);
              done();
            });
          });
        });

        it('should not verify a user given a non-matching email address', function (done) {
          models.User.create({
            username: 'validusername',
            email_address: 'valid@example.com',
            password: 'keyboardcat'
          }).complete(function (err, user) {
            if (err) { throw err; }
            user.verify(
              user.verification_code,
              'notsame@example.com'
            ).then(function(user) {
              expect(user.isVerified()).to.be(false);
              done();
            }).catch(function (err) {
              expect(err.notVerified).to.be(true);
              done();
            });
          });
        });

        it('should not verify a user given both a non-matching verification code *and* email address', function (done) {
          models.User.create({
            username: 'validusername',
            email_address: 'valid@example.com',
            password: 'keyboardcat'
          }).complete(function (err, user) {
            user.verify(
              'notsame',
              'notsame@example.com'
            ).then(function (user) {
              expect(user.isVerified()).to.be(false);
              done();
            }).catch(function (err) {
              expect(err.notVerified).to.be(true);
              done();
            });
          });
        });

        it('should verify a user given a matching verification code and email address', function (done) {
          models.User.create({
            username: 'validusername',
            email_address: 'valid@example.com',
            password: 'keyboardcat'
          }).complete(function (err, user) {
            user.verify(
              user.verification_code,
              user.email_address
            ).then(function (user) {
              expect(user.isVerified()).to.be(true);
              done();
            }).catch(function (err) {
              throw err;
            })
          });
        });
      });
    });

    describe('relationship', function () {
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
                device.getOwner().then(function (u) {
                  expect(u != null).to.be(true);
                  expect(u.id).to.be(user.id);
                  done();
                }).catch(function (err) {
                  throw err;
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
                      device.grantAccessTo(user, users[0]).then(function (user) {
                        callback(null)
                      }).catch(callback);
                    },
                    function (callback) {
                      device.grantAccessTo(user, users[1]).then(function (user) {
                        callback(null)
                      }).catch(callback);
                    }
                  ], function (err, users) {
                    if (err) { throw err; }
                    device.getUser().complete(function (err, maintainers) {
                      expect(maintainers.length).to.be(3);
                      done();
                    });
                  })
                });
              });
            });
          });
          describe('isAdmin', function () {
            it('should identify an owner as an admin', function (done) {
              user.createALISDevice().complete(function (err, device) {
                if (err) { throw err; }
                device.isAdmin(user).then(function (result) {
                  expect(result).to.be(true);
                  done();
                }).catch(function (err) {
                  throw err;
                });
              });
            });
            xit('should identify an admin as an admin', function (done) {
              User.createALISDevice()
            });
          });
        });

        describe('modification', function () {
          describe('grantAccessTo', function () {
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
                    device.grantAccessTo(user, user2).then(function(user) {
                      device.hasAccess(user).then(function (result) {
                        expect(result).to.be(true);
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
        });
      });
    });

    describe('authentication', function () {
      it('should not authenticate someone if there aren\'t any records in the database', function (done) {
        models
          .User
          .authenticate('nonexistent', 'nonexistent')
          .then(function () {
            throw err;
          })
          .catch(function (err) {
            expect(err.message).to.be('User not found');
            done();
          });
      });

      it('should authenticate someone, given a username and password that match a record', function (done) {
        var aliceCredentials = {
          username: 'alice',
          password: 'somepassword',
          email_address: 'alice@wonderland.com'
        };
        async.parallel([
          function (callback) {
            models
              .User
              .create(aliceCredentials)
              .complete(function (err, user) {
                if (err) { return callback(err); }
                callback(null);
              })
          },
          function (callback) {
            models
              .User
              .create({
                username: 'bob',
                password: 'somepassword',
                email_address: 'valid@example.com'
              })
              .complete(function (err, user) {
                if (err) { return callback(err); }
                callback(null);
              })
          }
        ], function (err) {
          if (err) { throw err; }
          models
            .User
            .authenticate(aliceCredentials.username, aliceCredentials.password)
            .then(function (user) {
              expect(user.username).to.be(aliceCredentials.username);
              done();
            })
            .catch(function (err) {
              throw err;
            });
        });
      });
    });
  });

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

    describe('findOrCreateEnergyConsumer', function () {
      it('should create a consumer, if one wasn\'t found', function (done) {
        user.createALISDevice().complete(function (err, alisDevice) {
          if (err) { throw err; }
          var consumerId = 'hello,world';
          alisDevice.findOrCreateEnergyConsumer(consumerId).then(function (consumer) {
            alisDevice.getEnergyConsumers().complete(function (err, consumers) {
              if (err) { throw err; }
              expect(consumers[0].remote_consumer_id).to.be(consumerId);
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
          var consumerId = 'hello,world';
          alisDevice.findOrCreateEnergyConsumer(consumerId).then(function (consumer) {
            alisDevice.getEnergyConsumers().complete(function (err, consumers) {
              if (err) { throw err; }
              alisDevice
                .findOrCreateEnergyConsumer(consumers[0].remote_consumer_id)
                .then(function (consumer) {
                  expect(consumers[0].remote_consumer_id).to.be(consumerId);
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

  describe('EnergyConsumptions', function () {
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
      it('initialize new energy consumer rows given consumer ids that don\'t match anything on record', function (done) {
        models.EnergyConsumer.findAll({}).complete(function (err, consumers) {
          if (err) { throw err; }
          expect(consumers.length).to.be(0);
          models.EnergyConsumptions.bulkCreate({
            time: new Date(),
            uuid_token: device.uuid_token,
            client_secret: device.client_secret,
            energy_consumptions: [
              {
                id: '1',
                kw: 0.1231,
                kwh: 0.32432,
              },
              {
                id: '2',
                kw: 1.342,
                kwh: 2.4234
              },
              {
                id: '3',
                kw: 0.0234,
                kwh: 0.14234
              }
            ]
          }).then(function (consumptions) {
            expect(consumptions.length).to.be(3);
            models.EnergyConsumer.findAll({}).complete(function (err, consumers) {
              expect(consumers.length).to.be(3);
              done();
            });
          }).catch(function (err) {
            throw err;
          });
        });
      });

      xit('should reject requests, if the provided ALIS device UUID token and client secret don\'t anything on record', function (done) {
        throw new Error('Not yet spec\'d');
      })
    });
  });
});
