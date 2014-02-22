var sequelize = require('../../../models/seq');
var models = require('../../../models');
var expect = require('expect.js');
var async = require('async');
var UserALISDevice = models.UserALISDevice;
var validator = require('validator');
var bcrypt = require('bcrypt');

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

    describe('api_key', function () {
      it('should create a new API key', function (done) {
        models.User.create({
          username: 'username',
          email_address: 'valid@example.com',
          password: 'keyboardcat'
        }).complete(function (err, user) {
          if (err) { throw err; }
          expect(user.api_key).to.be.a('string')
          done();
        })
      })
    });

    describe('client_secret', function () {

      it('should create a new client secret', function (done) {
        models.User.create({
          username: 'username',
          email_address: 'valid@example.com',
          password: 'keyboardcat'
        }).complete(function (err, user) {
          if (err) { throw err; }
          expect(user.client_secret).to.be.a('string');
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

    // TODO: nest the two tests into a describe call.

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

    describe('password', function () {
      it('should allow a user to request that they have their password reset', function (done) {
        var email = 'valid@example.com';
        models.User.create({
          username: 'janedoe',
          email_address: email,
          password: 'keyboardcat'
        }).complete(function (err, user) {
          if (err) { throw err; }
          models.User.setResetFlag(email).then(function (user) {
            expect(validator.isUUID(user.password_reset_code)).to.be(true);
            expect(user.password_reset_expiry).to.be.a(Date);
            done();
          }).catch(function (err) {
            throw err;
          })
        })
      });

      it('should allow a user to reset their password, given the email address, validation code, and password', function (done) {
        var email = 'valid@example.com';
        models.User.create({
          username: 'johndoe',
          email_address: email,
          password: 'keyboardcat'
        }).complete(function (err, user) {
          if (err) { throw err; }
          var oldHash = user.password;
          models.User.setResetFlag(email).then(function (user) {
            var newPassword = 'someotherpassword';
            models.User.resetPassword(user.email_address, user.password_reset_code, newPassword).then(function (user) {
              expect(user.password).to.not.be(oldHash);
              bcrypt.compareSync(newPassword, user.password);
              done();
            }).catch(function (err) {
              throw err;
            })
          }).catch(function (err) {
            throw err;
          });
        });
      });

      describe('expired reset', function () {
        it('should not allow a user to reset their password if their reset code has expired', function (done) {
          var email = 'valid@example.com';
          models.User.create({
            username: 'johndoe',
            email_address: email,
            password: 'keyboardcat'
          }).complete(function (err, user) {
            if (err) { throw err; }
            var oldHash = user.password;
            models.User.setResetFlag(email).then(function (user) {
              user.password_reset_expiry = new Date(user.password_reset_expiry.getTime() - 1000 * 60 * 60 * 24 * 4);
              user.save().complete(function (err, user) {
                var newPassword = 'someotherpassword';
                models.User.resetPassword(user.email_address, user.password_reset_code, newPassword).then(function (user) {
                  expect(user).to.be(null);
                  done();
                }).catch(function (err) {
                  throw err;
                });
              });
            }).catch(function (err) {
              throw err;
            });
          });
        });
      });
    });

    describe('verification', function () {
      it('should allow for the modification of a verification', function (done) {
        models.User.create({
          username: 'validusername',
          email_address: 'valid@example.com',
          password: 'keyboardcat'
        }).complete(function (err, user) {
          if (err) { throw err; }

          var oldVerificationCode = user.verfication_code;

          user.resetVerificationCode().complete(function (err, user) {
            if (err) { throw err; }
            expect(user.verification_code).to.not.be(oldVerificationCode);
            done();
          });
        });
      });

      it('should not allow the modification of a verification code of a user that has already been verified', function (done) {
        models.User.create({
          username: 'validusername',
          email_address: 'valid@example.com',
          password: 'keyboardcat'
        }).complete(function (err, user) {
          if (err) { throw err; }

          user.verify(user.verification_code, user.email_address).then(function (user) {
            user.resetVerificationCode().complete(function (err, user) {
              expect(err != null).to.be(true);
              // TODO: Find a better way to determine whether or not the error
              //   is an instance of ValidationErrors.
              expect(err.fields != null).to.be(true);
              done();
            });
          }).catch(function (err) {
            throw err;
          });
        })
      });

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

    describe('api_key', function () {
      it('should not allow for the modification of an API key', function (done) {
        models.User.create({
          username: 'janedoe',
          email_address: 'valid@example.com',
          password: 'keyboardcat'
        }).complete(function (err, user) {
          if (err) { throw err; }
          user.api_key = 'somethingelse';
          user.save().complete(function (err, user) {
            if (!err) { throw new Error('There should have been an error.'); }
            done();
          });
        })
      });
    });

    describe('client_secret', function () {
      describe('resetClientSecret', function () {
        it('should reset the client secret', function (done) {
          models.User.create({
            username: 'username',
            email_address: 'valid@example.com',
            password: 'keyboardcat'
          }).complete(function (err, user) {
            if (err) { throw err; }
            var oldClientSecret = user.client_secret;
            user.resetClientSecret().complete(function (err, user) {
              if (err) { throw err; }
              expect(user.client_secret).to.be.a('string');
              expect(user.client_secret).to.not.be(oldClientSecret);
              done();
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

    it('should authenticate someone, given a email address and password that match a record', function (done) {
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
          .authenticate(aliceCredentials.email_address, aliceCredentials.password)
          .then(function (user) {
            expect(user.username).to.be(aliceCredentials.username);
            expect(user.email_address).to.be(aliceCredentials.email_address);
            done();
          })
          .catch(function (err) {
            throw err;
          });
      });
    });

    it('should authenticate someone, given a username with a different case, and password that match a record', function (done) {
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
          .authenticate(aliceCredentials.username.toUpperCase(), aliceCredentials.password)
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