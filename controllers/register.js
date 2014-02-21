var route = require('./middlewares');
var fs = require('fs');
var passport = require('passport');
var transport = require('./transport');
var _ = require('lodash');
var settings = require('../settings');
var querystring = require('querystring');

module.exports = function (app, models) {

  /*
   * Sends a verification code to the specified user.
   */

  function sendVerification(user, filename, subject, callback) {
    callback = callback || function () {};
    fs.readFile(filename, 'utf8', function (err, data) {
      transport.sendMail({
        from: 'westhouse@sfu.ca',
        to: user.email_address,
        subject: subject,
        text: _.template(data, {
          name: user.full_name,
          link: settings.get('rootHost') + '/register/verify?' + querystring.stringify({
            email: user.email_address,
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
      models
        .User
        .create({
          full_name: req.body.full_name,
          username: req.body.username,
          email_address: req.body.email_address,
          password: req.body.password
        }).complete(function (err, user) {
          // TODO: find a more cleaner method for detecting and displaying errors.
          if (err) {
            req.flash('error', 'We\'re having a hard time understanding that');

            // This means that credentials provided by the user was duplicate.
            if (duplicateErrorChecker.isDuplicate(err)) {
              return (function () {

                // Get information about the faulty field.
                var field = duplicateErrorChecker.getField(err);

                // Push out information regarding the fields.
                req.flashField('full_name', null, null, req.body.full_name);
                if (field.field === 'username') {
                  req.flashField('username', 'error', 'Username already in use', field.value);
                } else {
                  req.flashField('username', null, null, req.body.username);
                }
                if (field.field === 'email_address') {
                  req.flashField('email_address', 'error', 'Email address already in use', field.value);
                } else {
                  req.flashField('email_address', null, null, req.body.email_address);
                }

                res.redirect('/register');
              })();
            }

            // TODO: This if-else block is really bad. Refactor it.
            if (!(err instanceof Error) || err.name === 'ValidationErrors') {
              return (function () {

                if (err.full_name) {
                  req.flashField('full_name', 'error', 'Something went wrong here... Our bad...', req.body.full_name);
                } else {
                  req.flashField('full_name', null, null, req.body.full_name);
                }
                if (err.username || err.chosen_username) {
                  req.flashField('username', 'error', 'Only alpha-numeric characters, hypens and underscores are allowed, and can only have a length between 1 and 35 characters', req.body.username)
                } else {
                  req.flashField('username', null, null, req.body.username);
                }
                if (err.email_address) {
                  req.flashField('email_address', 'error', 'Must be a valid email address', req.body.email_address);
                } else {
                  req.flashField('email_address', null, null, req.body.email_address);
                }
                if (err.password) {
                  req.flashField('password', 'error', 'Password must have a minimum length of 6 characters');
                } else {
                  req.flashField('password', null, null);
                }

                res.redirect('/register');
              })();
            }

            return next(err);
          }

          sendVerification(user, './email/verification.txt.lodash', 'Welcome to ALIS Web Portal', function (err, response) {
            if (err) { return console.error(err); }
            console.log(response.message);
          });

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