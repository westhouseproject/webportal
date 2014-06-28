const Datastore = require('nedb');
const bcrypt = require('bcrypt');
const async = require('async');
const validator = require('validator');

const users = new Datastore({ filename: './.db/users', autoload: true });
module.exports = users;

module.exports.createUser = function (options, cb) {
  const minPasswordLength = 6;

  // First, perform the validations
  if (
    !validator.isEmail(options.email) ||
    !validator.isLength(options.password, 6)
  ) {
    return cb(null, false, {
      invalid: true,
      fields: {
        name: {
          value: options.name,
          invalid: false
        },
        email: {
          value: options.email,
          invalid: !validator.isEmail(options.email)
        },
        password: {
          value: options.password,
          invalid: !validator.isLength(options.password, 6)
        }
      }
    });
  }

  async.waterfall([
    // Look for any pre-existing users
    function (callback) {
      users.find({
        email: options.email
      }, function (err, users) {
        if (err) { return callback(err); }
        if (users && users.length) {
          return cb(null, false, {
            duplicate: true,
            fields: {
              name: { value: options.name, invalid: false },
              email_address: { value: options.email, invalid: true },
              password: { value: options.password, invalid: false }
            }
          });
        }
        callback(null)
      });
    },

    // Next, hash the password
    function (callback) {
      bcrypt.hash(options.password, 11, function (err, hash) {
        if (err) { return callback(err); }

        callback(null, hash);
      });
    },

    // Now, insert the user
    function (hash, callback) {
      users.insert({
        name: options.name,
        email: options.email,
        hash: hash
      }, callback);
    }
  ], cb);
};

module.exports.authenticateUser = function (options, cb) {
  async.waterfall([
    // First, find the user.
    function (callback) {
      users.find({
        email: options.email
      }, function (err, users) {
        if (err) { return callback(err); }
        if (!users || !users.length) {
          return cb(null, null, {
            notFound: true
          });
        }
        callback(null, users[0]);
      });
    },

    // Next, compare the passwords.
    function (user, callback) {
      bcrypt.compare(options.password, user.hash, function (err, res) {
        if (err) { return callback(err); }
        if (!res) {
          return cb(null, false, {
            passwordMismatch: true
          })
        }
        callback(null, user);
      });
    }
  ], cb);
};