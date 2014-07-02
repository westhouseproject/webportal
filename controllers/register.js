const route = require('./middlewares');
const fs = require('fs');
const passport = require('passport');
const transport = require('./transport');
const _ = require('lodash');
const settings = require('../settings');
const querystring = require('querystring');
const users = require('../users');

module.exports = function (app) {

  var duplicateErrorChecker = {

    isDuplicate: function (err) {
      return (
        err.errno === 1062 &&
        err.code === 'ER_DUP_ENTRY'
      );
    },

    /*
     * Gets the field and the value that are a duplicate.
     */

    getField: function (err) {
      var field = err.message.match(/[a-zA-Z123_]+'$/)[0].slice(0, -1);
      
      var firstHalfLen = 'ER_DUP_ENTRY: Duplicate entry \''.length;
      var secondHalfLen = '\' for key \''.length + field.length + 1;

      var value = err.message.slice(firstHalfLen, -secondHalfLen);

      return {
        field: field,
        value: value
      }
    }

  };

  app.get(
    '/register',
    route.ensureUnauthenticated,
    function (req, res) {
      res.render('register');
    }
  );

  // TODO: require a password to change the email address.
  app.post(
    '/register',
    route.ensureUnauthenticated,
    function (req, res, next) {

      // Creating user.
      users.createUser({
        name: req.body.full_name,
        email: req.body.email_address,
        password: req.body.password
      }, function (err, user, meta) {

        // End of the line.
        if (err) { return next(err); }

        // The list of possible errors.
        const invalidErrors = {
          email_address: [ 'error', 'Not a valid email_address' ],
          password: [ 'error', 'Password is too short' ]
        };

        // If `user` is falsey, then this means that there was an issue with the
        // inputed values.
        if (!user) {
          req.flash('error', 'There was some issues with your input');

          // This means that either the user's email address is invalid, or the
          // password is too short.
          if (meta.invalid) {

            req.flashField(
              'full_name', null, null,
              (meta.fields.name && meta.fields.name.value) || ''
            );

            req.flashField.apply(
              req,
              ['email_address']
                .concat(
                  (
                    meta.fields.email &&
                    meta.fields.email.invalid &&
                    invalidErrors['email_address']
                  ) || [null, null]
                )
                .concat([
                  (
                    meta.fields.email &&
                    meta.fields.email.value
                  ) || ''
                ])
            );

            req.flashField.apply(
              req,
              [ 'password' ]
                .concat(
                  (
                    meta.fields.password &&
                    meta.fields.password.invalid &&
                    invalidErrors['password']
                  ) || [null, null]
                )
                // Don't relay back the password.
                .concat([ '' ])
            );

            return res.redirect('/register');
          }

          // This means that the email address is a duplicate.
          if (meta.duplicate) {
            // Name will always be valid.
            req.flashField(
              'full_name',
              null,
              null,
              (meta.fields.name && meta.fields.name.value) || ''
            );

            // Because only email address need to be unique, then this would
            // mean that the email address was a duplicate. Otherwise, well,
            // we're just not going to catch that at the moment.
            req.flashField(
              'email_address',
              'error',
              'Email address already in use',
              meta.fields.email_address.value
            );

            // Don't relay back the password.

            return res.redirect('/register');
          }

          // We should not have reached here. Raise an exception.
          return next(new Error('Unkown error.'));

        }

        req.body.username = req.body.email_address

        // Log the user in afterwards.
        passport.authenticate(
          'local',
          {
            successRedirect: '/',
            failureRedirect: '/'
          }
        )(req, res, next);
      });
    }
  );

};