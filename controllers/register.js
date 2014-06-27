const route = require('./middlewares');
const fs = require('fs');
const passport = require('passport');
const transport = require('./transport');
const _ = require('lodash');
const settings = require('../settings');
const querystring = require('querystring');
const users = require('../users');

module.exports = function (app) {

  /*
   * Sends a verification code to the specified user.
   */

  function sendVerification(user, filename, subject, callback) {
    callback = callback || function () {};
    fs.readFile(filename, 'utf8', function (err, data) {
      transport.sendMail({
        from: 'westhouse@sfu.ca',
        to: user.email,
        subject: subject,
        text: _.template(data, {
          name: user.full_name,
          link: settings.get('rootHost') + '/register/verify?' + querystring.stringify({
            email: user.email,
            verification: user.verification_code
          })
        })
      }, callback);
    });
  }

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

  app.get(
    '/register/resend',
    route.ensureAuthenticated,
    route.ensureUnverified,
    function (req, res, next) {
      req.user.resetVerificationCode().complete(function (err, user) {
        if (err) { return next(err); }
        sendVerification(user, './email/verification-reset.txt.lodash', 'Just one more step...', function (err, response) {
          if (err) { return console.error(err); }
          console.log(response.message);
        });
        next();
      });
    },
    function (req, res, next) {
      if (req.accepts('html')) { return next(); }
      res.json({ message: 'success' });
    },
    function (req, res, next) {
      req.flash('success', 'A new verification code has been sent to your email');
      res.redirect('/');
    }
  );

  // TODO: require a password to change the email addres.
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
          email_address: [ 'error', 'Not a valid email address' ],
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

            // Because only email addresses need to be unique, then this would
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

        // Send an email verification to the user that just signed up.
        sendVerification(
          user,
          './email/verification.txt.lodash',
          'Welcome to ALIS Web Portal',
          function (err, response) {
            if (err) { return console.error(err); }
            console.log(response.message);
          }
        );

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

  app.get(
    '/register/verify',
    route.ensureAuthenticated,
    route.ensureUnverified,
    function (req, res, next) {
      req.user.verify(req.query.verification, req.query.email).then(function (user) {
        req.flash('success', 'Your account is now verified!');
        res.redirect('/');
      }).catch(next);
    }
  )
};