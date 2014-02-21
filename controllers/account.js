var route = require('./middlewares');

module.exports = function (app) {
  app.get(
    '/account',
    route.ensureAuthenticated,
    function (req, res) {
      res.render('account');
    }
  );

  app.get(
    '/account/forgot',
    route.ensureUnauthenticated,
    function (req, res) {
      res.render('account-forgot');
    }
  );

  app.post(
    '/account/forgot',
    route.ensureUnauthenticated,
    function (req, res, next) {
      models.User.setResetFlag(req.body.email_address).then(function (user) {
        if (!user) {
          return (function () {
            req.flash('warning', 'The address, "' + req.body.email_address + '," doesn\'t seem to be associated with any user');
            res.redirect('/account/forgot');
          })();
        }

        fs.readFile('./email/password-reset.txt.lodash', 'utf8', function (err, data) {
          if (err) { return console.error(err); }
          transport.sendMail({
            from: 'westhouse@sfu.ca',
            to: user.email_address,
            subject: 'Reset your password',
            text: _.template(data, {
              name: user.full_name,
              resetLink: settings.get('rootHost') + createResetPath(
                user.email_address,
                user.password_reset_code
              )
            }, function (err, response) {
              if (err) { return console.error(err); }
              console.log(response.message);
            })
          })
        });
        req.flash('success', 'A password reset link has been sent to your email')
        res.redirect('/');
      }).catch(next);
    }
  );

  // TODO: ideally, this should be a put request.
  app.post(
    '/account',
    route.ensureAuthenticated,
    function (req, res, next) {
      if (req.body.new_password !== req.body.password_repeat) {
        return (function () {
          req.flash('error', 'The password repeat does not match');
          res.redirect('/account');
        })();
      }

      var previousEmail = req.user.email_address;

      // TODO: accept changes for only a subset of fields, when any of them are
      //   poorly formatted. So far, when one of them is poorly formatted, no
      //   changes are accepted.
      // 
      //   As a consequence, it's best to use async.parallel instead of
      //   async.waterfall.

      async.waterfall([
        function (callback) {
          if (req.body.new_password) {
            return req.user.changePassword(req.body.password, req.body.new_password).then(function (res) {
              if (!res.result) {
                return callback(new Error('An error occured trying to change password.'));
              }

              // TODO: email the user when the password has been changed.

              callback(null);
            }).catch(callback);
          }
          callback(null);
        },
        function (callback) {
          req.user.full_name = req.body.full_name;
          req.user.email_address = req.body.email_address;
          req.user.save().success(function (user) {
            callback(null, user);
          }).error(callback);
        }
      ], function (err, user) {
        if (err) {
          return (function () {
            req.flash('error', err.message);
            res.redirect('/account')
          })();
        }
        if (user.email_address !== previousEmail) {
          fs.readFile('./email/email-change.txt.lodash', 'utf8', function (err, data) {
            transport.sendMail({
              from: 'westhouse@sfu.ca',
              to: previousEmail,
              subject: 'Your email address has been changed',
              text: _.template(data, {
                name: user.full_name,
                newEmail: user.email_address,
                supportEmail: settings.get('supportEmail')
              })
            }, function (err, response) {
              if (err) { return console.error(err); }
              console.log(response.message);
            });
          });
        }
        req.flash('success', 'Your account info has been updated.');
        res.redirect('/account');
      });
    }
  );

  app.get(
    '/account/reset-password',
    route.ensureUnauthenticated,
    function (req, res, next) {
      models.User.isResetRequestValid(req.query.email, req.query.token).then(function (res) {
        var result = res.result;

        if (!result) {
          return (function () {
            req.flash('error', 'The reset code seems to be either expired or invalid.');
            res.redirect('/account/forgot');
          })();
        }

        res.render('account-reset-password', {
          email: req.query.email,
          verificationCode: req.query.token
        });
      }).catch(next);
    }
  );

  app.post(
    '/account/reset-password',
    route.ensureUnauthenticated,
    function (req, res, next) {
      if (req.body.password !== req.body.password_repeat) {
        return (function () {
          req.flash('error', 'The password and the repeat don\'t match.');
          res.redirect(createResetPath(req.query.email, req.query.code));
        })();
      }

      models.User.resetPassword(req.body.email, req.body.code, req.body.password).then(function (user) {
        req.flash('success', 'Your password has been successfully changed.');
        res.redirect('/');
      }).catch(next);
    }
  );

  app.get(
    '/account/client-secret/reset',
    route.ensureAuthenticated,
    function (req, res) {
      res.render('account-client-secret-reset');
    }
  );

  app.post(
    '/account/client-secret/reset',
    route.ensureAuthenticated,
    function (req, res, next) {
      req.user.resetClientSecret().complete(function (err, user) {
        if (err) { return next(err); }
        req.flash('success', 'Your client secret has been reset.');
        res.redirect('/account');
      });
    }
  );
};