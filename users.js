const Datastore = require('nedb');
const bcrypt = require('bcrypt');
const async = require('async');
const validator = require('validator');
const _ = require('lodash');

const users = new Datastore({ filename: './.db/users', autoload: true });
module.exports = users;

// TODO: Limit the number of allowed unverified users.
// TODO: possible vector of attack? Denying the creation of additional users by
//   flooding the number of unverified users?

// TODO: create a factory function or a constructor function for a "safer"
//   user data object.

function hashPassword(password, callback) {
  bcrypt.hash(password, 11, function (err, hash) {
    if (err) { return callback(err); }

    callback(null, hash);
  });
}

function isValidPassword(password) {
  const minPasswordLength = 6;
  return validator.isLength(password, minPasswordLength);
};

module.exports.createUser = function (options, cb) {

  // First, perform the validations
  if (
    !validator.isEmail(options.email) ||
    !isValidPassword(options.password)
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
              email: { value: options.email, invalid: true },
              password: { value: options.password, invalid: false }
            }
          });
        }
        callback(null)
      });
    },

    // Next, hash the password
    function (callback) {
      hashPassword(options.password, function (err, hash) {
        if (err) { callback(err); }
        callback(null, hash);
      });
    },

    function (hash, callback) {
      module.exports.getUsers(function (err, users) {
        if (err) { return callback(err); }
        callback(null, users.length, hash);
      });
    },

    // Now, insert the user
    function (usersLength, hash, callback) {
      users.insert({
        name: options.name,
        email: options.email,
        hash: hash,
        isAdmin: !usersLength,
        verified: !usersLength,
        isOwner: !usersLength,
        created: new Date().toISOString()
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
          return cb(null, false, {
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
        // TODO: use a constructor instead.
        var retval = {};
        for (var key in user) {
          retval[key] = user[key];
        }
        delete retval.hash;
        retval.created = new Date(retval.created);
        callback(null, retval);
      });
    }
  ], cb);
};

module.exports.getUsers = function (cb) {
  users.find({}, function (err, docs) {
    if (err) { return cb(err); }
    var users = docs.map(function (user) {

      // TODO: user a constructor instead.
      var retval = {};
      for (var key in user) {
        retval[key] = user[key];
      }
      delete retval.hash;
      retval.created = new Date(retval.created);
      return retval;
    });
    cb(null, users);
  });
};

/**
 * Validates whatever data the client provides. We don't want them doing
 * anything unauthorized.
 */
module.exports.isPermitted = function (user, document, cb) {

  function asyncCb() {
    var args = arguments;
    setImmediate(function () {
      cb.apply(this, args);
    });
  }

  if (!_.isUndefined(document.owner)) {
    return asyncCb(null, false, {
      message: 'The ownership can never be changed',
      reason: 'illegal'
    });
  }

  // A non-admin user can only edit their own personal information.
  if (document._id !== user._id && (!user.isAdmin || !user.isOwner)) {
    return asyncCb(null, false, {
      message: 'A non-admin user can only modify its own personal information',
      reason: 'illegal'
    });
  }

  // A non-admin user cannot change anyone's administrative privileges
  if (
    !_.isUndefined(document.isAdmin) && (!user.isAdmin || user.isOwner)
  ) {
    return asyncCb(null, false, {
      message: 'A non-admin user cannot modify administrative settings',
      reason: 'illegal'
    });
  }

  async.waterfall([

    // First, check to see whether or not the user is trying to modify itself,
    // and if so, then check to see if it is trying to modify either its email
    // address or its password. If so, then check for a `oldPassword` field in
    // the document.
    function (callback) {

      // If the client didn't want to change either the email address, or the
      // password, then just continue on.
      if (_.isUndefined(document.email) && _.isUndefined(document.password)) {
        return setImmediate(function () {
          callback(null);
        });
      }

      // If the client did want to change either the email address, then be sure
      // that the document belongs to the user that it is representing.
      if (
        (!_.isUndefined(document.email) || !_.isUndefined(document.password)) &&
        document._id !== user._id
      ) {
        return asyncCb(null, false, {
          message: 'Users can only change their own password',
          reason: 'illegal'
        });
      }

      // This means the client represents the user, and it wants to change the
      // email address and/or password.
      bcrypt.compare(
        document.currentPassword,
        user.hash,
        function (err, result) {
          if (err) { return callback(err); }
          if (!result) {
            return cb(null, false, {
              message: 'Password does not correspond with the user',
              reason: 'illegal'
            });
          }
          return callback(null);
        }
      );

    }

  ], function (err) {
    if (err) { return cb(err); }
    cb(null, true);
  });
};

/**
 * Safely updates the data in the database. However, it does not check for
 * authorization. It just simply ensures that `hash`, `_id`, and `created` are
 * never modified by the specified `document` object, and that no unnecessary
 * properties get added. And if the client wants to change the password, this
 * implies that he `hash` property needs to change. Fortunately, the client can
 * supply a `password` property, and the hash will be updated accordingly.
 */
module.exports.safeUpdate = function (id, document, cb) {

  // Validate the email address.
  if (!_.isUndefined(document.email) && !validator.isEmail(document.email)) {
    return setImmediate(function () {
      callback(null, false, {
        message: 'Email address is not valid.',
        reason: 'badrequest',
        fields: {
          email: document.email
        }
      });
    });
  }

  // Validate the password.
  if (
    !_.isUndefined(document.password) && !isValidPassword(document.password)
  ) {
    return setImmediate(function () {
      callback(null, false, {
        message: 'Password is too short.',
        reason: 'badrequest',
        fields: {
          password: document.password
        }
      });
    });
  }

  async.waterfall([

    // Only pick out the properties that we want.
    function (callback) {
      var toUpdate = _.pick(
        document, 'name', 'email', 'isAdmin', 'verified', 'isOwner'
      );

      setImmediate(function () {
        callback(null, toUpdate);
      });
    },

    // Next, if the user requests it, change the password.
    function (toUpdate, callback) {
      if (_.isUndefined(document.password)) {
        return setImmediate(function () {
          callback(null, toUpdate);
        });
      }

      hashPassword(document.password, function (err, hash) {
        if (err) { return callback(err); }
        toUpdate.hash = hash;
        callback(null, toUpdate);
      });
    },

    // Afterwards, update the user.
    function (toUpdate, callback) {
      users.update(
        {_id: id},
        {$set: toUpdate},
        {},
        function (err, numReplaced, newDoc) {
          if (err) { return callback(err); }
          if (!numReplaced) {
            return cb(null, false, {
              message: 'User not found',
              reason: 'notfound'
            });
          }
          callback(null, newDoc)
        }
      );
    }

  ], function (err, newDoc) {
    if (err) { cb(err); }
    cb(null, newDoc);
  });

};
