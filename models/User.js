var Sequelize = require('sequelize');
var async = require('async');
var uuid = require('node-uuid');
var crypto = require('crypto');
var bcrypt = require('bcrypt');
var bluebird = require('bluebird');
var UnauthorizedError = require('./UnauthorizedError');
var seq = require('./seq');
var VerificationError = require('./VerificationError');
var ValidationErrors = require('./ValidationErrors');
var validator = require('validator');

/*
 * Represents a user.
 */

// TODO: enable account recovery, when the user has their email changed.
module.exports = seq.define('user', {
  username: {
    type: Sequelize.STRING,
    unique: true,
    allowNull: false,
    validate: {
      is: [ '^[a-z0-9_-]{1,35}$', '' ]
    }
  },
  chosen_username: {
    type: Sequelize.STRING,
    unique: true,
    allowNull: false,
    validate: {
      is: [ '^[A-Za-z0-9_-]{1,35}$', '' ]
    }
  },
  full_name: {
    type: Sequelize.STRING,
    validate: {
      len: [0, 200]
    }
  },
  email_address: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: Sequelize.STRING,
    allowNull: false
  },
  verification_code: Sequelize.STRING,
  password_reset_code: Sequelize.STRING,
  password_reset_expiry: Sequelize.DATE,
  api_key: {
    type: Sequelize.STRING,
    allowNull: false
  },
  client_secret: {
    type: Sequelize.STRING,
    allowNull: false
  }
}, {
  instanceMethods: {
    normalizeUsername: function () {
      // TODO: check for changes in the `chosen_username` column.

      if (this.changed('username')) {
        this.chosen_username = this.username;
        this.username = this.chosen_username.toLowerCase();
      }
    },

    /*
     * Verifies a user. Without verification, the user can't register a new
     * ALIS device.
     */

    verify: function (verification_code, email_address) {
      var def = bluebird.defer();
      var self = this;


      process.nextTick(function () {
        if (
          verification_code !== self.verification_code ||
          email_address !== self.email_address
        ) {
          var err = new VerificationError('Error verification code or email don\'t match.');
          err.notVerified = true;
          return def.reject(err);
        }

        self.updateAttributes({
          verification_code: null
        }).complete(function (err, user) {
          if (err) { return def.reject(err); }
          def.resolve(user);
        });
      });

      return def.promise;
    },

    _changeVerificationCode: function () {
      this.verification_code = uuid.v4();
    },

    /*
     * A convenience function to quickly change the user's verification code.
     */

    resetVerificationCode: function () {
      this._changeVerificationCode();
      return this.save();
    },

    /*
     * Convenience method, used to determine whether or not the user is verified.
     */

    isVerified: function () {
      return this.verification_code == null;
    },

    /*
     * Gets rid of the password reset flags.
     */

    // TODO: actually call this method!
    _clearPasswordReset: function () {
      this.password_reset_code = null;
      this.password_reset_expiry = null;
      return this.save();
    },

    /*
     * A convenience function for changing the password, given a previous one.
     */

    // TODO: unit test this.
    changePassword: function (oldPassword, newPassword) {
      var self = this;
      var def = bluebird.defer();
      bcrypt.compare(oldPassword, this.password, function (err, res) {
        if (err) { return def.reject(err); }
        if (!res) { return def.resolve({ result: false}); }
        self.password = newPassword;
        self.save().complete(function (err, user) {
          if (err) { return def.reject(err); }
          def.resolve({ result: true, user: user});
        });
      });
      return def.promise;
    },

    _resetClientSecret: function () {
      this.client_secret = crypto.randomBytes(32).toString('hex');
    },

    resetClientSecret: function () {
      this._resetClientSecret();
      return this.save();
    }
  },
  classMethods: {
    authenticate: function (username, password) {
      var def = bluebird.defer();

      // NB: search for a username is case-insensitive.

      this
        .find({
          where: [ 'username = ? OR email_address = ?', username, username ]
        }).complete(function (err, user) {
          if (err) { return def.reject(err); }
          if (!user) {
            return def.reject(new UnauthorizedError('User not found'));
          }
          bcrypt.compare(password, user.password, function (err, res) {
            if (err) {
              return def.reject(err);
            }
            if (!res) {
              return def.reject(new UnauthorizedError('Password does not match'));
            }

            def.resolve(user);
          });
        });

      return def.promise;
    },

    /*
     * Sets a user's password reset code.
     */

    setResetFlag: function (email) {
      var def = bluebird.defer();
      this.find({
        where: [ 'email_address = ?', email ]
      }).complete(function (err, user) {
        if (err) { return def.reject(err); }
        if (!user) { return def.resolve(null); }
        user.password_reset_code = uuid.v4();
        user.save().complete(function (err, user) {
          if (err) { return def.reject(err); }
          def.resolve(user);
        })
      });
      return def.promise;
    },

    // TODO: integration/unit test this.
    isResetRequestValid: function (email, code) {
      var def = bluebird.defer();
      this.find({
        where: [
          'email_address = ? AND password_reset_code = ?',
          email,
          code
        ]
      }).complete(function (err, user) {
        var time = new Date();
        if (err) { return def.reject(err); }
        if (!user) { return def.resolve({ result: false }); }
        if (user.password_reset_expiry < time) { return def.resolve({ result: false }); }
        def.resolve({ result: true, user: user });
      });
      return def.promise;
    },

    // TODO: move the reset request validation to the above
    //   isResetRequestValid method.
    resetPassword: function (email, resetCode, newPassword) {
      var def = bluebird.defer();
      this.isResetRequestValid(email, resetCode).then(function (res) {
        var result = res.result;
        var user = res.user;

        if (!result || !user) {
          return def.resolve(null);
        }

        user.password = newPassword;
        user.save().complete(function (err, user) {
          def.resolve(user);
        });
      }).catch(def.reject.bind(def));
      return def.promise;
    }
  },
  hooks: {
    beforeValidate: function (user, callback) {
      async.parallel([
        function (callback) {
          if (user.isNewRecord) {
            // TODO: use the helper function.
            user.verification_code = uuid.v4();
          }
          process.nextTick(function () {
            callback(null);
          });
        },
        function (callback) {
          if (user.isNewRecord) {
            user.api_key = crypto.randomBytes(16).toString('hex');
          } else if (user.changed('api_key')) {
            return process.nextTick(function () {
              callback(new Error('Cannot change API key'));
            });
          }
          process.nextTick(function () {
            callback(null);
          });
        },
        function (callback) {
          if (user.isNewRecord) {
            user._resetClientSecret();
          }
          return process.nextTick(function () {
            callback(null);
          });
        },
        function (callback) {
          if (
            !user.isNewRecord &&
            user.changed('verification_code') &&
            user.previous('verification_code') == null) {
            return process.nextTick(function () {
              callback(new ValidationErrors({
                verification_code: 'The user is already verified.'
              }));
            });
          }
          process.nextTick(function () {
            callback(null);
          });
        },
        function (callback) {
          user.normalizeUsername();
          process.nextTick(function () {
            callback(null);
          });
        },
        function (callback) {
          // 6 is a hard limit unfortunately.
          if (
            !user.password ||
            (user.changed('password') && user.password.length < 6)
          ) {
            return process.nextTick(function () {
              callback(new ValidationErrors({
                password: 'Password is too short'
              }));
            });
          }
          if (user.changed('password')) {
            return bcrypt.hash(user.password, 12, function (err, hash) {
              if (err) { return callback(err); }
              user.password = hash;
              callback(null);
            });
          }

          callback(null);
        },
        function (callback) {
          if (user.password_reset_code != null && !validator.isUUID(user.password_reset_code)) {
            return process.nextTick(function () {
              callback(new ValidationErrors({
                password_reset_code: 'The password reset code must be a UUID token.'
              }));
            })
          }
          process.nextTick(function () {
            callback(null);
          });
        },
        function (callback) {
          if (
            user.changed('password_reset_code') &&
            user.password_reset_code != null
          ) {
            user.password_reset_expiry = new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 2);
          }
          process.nextTick(function () {
            callback(null);
          });
        }
      ], function (err) {
        if (err) {
          return callback(err);
        }

        callback(null);
      });
    }
  }
});
