const Datastore = require('nedb');
const bcrypt = require('bcrypt');
const async = require('async');
const validator = require('validator');

const users = new Datastore({ filename: './.db/users', autoload: true });
module.exports = users;

module.exports.createUser = function (options, cb) {
  // First, perform the validations
  if (!validator.isEmail(options.email) || !validator.isLength(options.password)) {
    return cb(null, false, {
      invalid: true,
      fields: {
        email: options.email
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
              email_address: options.email
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
      bcrypt.compare(options.password, user, hash, function (err, res) {
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