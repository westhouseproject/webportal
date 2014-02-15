var express = require('express');
var path = require('path');
var passport = require('passport');
var settings = require('./settings');
var Sequelize = require('sequelize');
var validator = require('validator');
var crypto = require('crypto');
var _ = require('lodash');
var lessMiddleware = require('less-middleware');
var nodemailer = require('nodemailer');
var LocalStrategy = require('passport-local').Strategy;
var async = require('async');
var RedisStore = require('connect-redis')(express);
var marked = require('marked');
var cheerio = require('cheerio');
var querystring = require('querystring');
var fs = require('fs');

// TODO: move all routes into their own controllers.
// TODO: rename the views to be much more coherent with a given route.

var sequelize = new Sequelize(
  settings.get('database:database'),
  settings.get('database:username'),
  settings.get('database:password'),
  settings.get('database:sequelizeSettings')
);

/*
 * Prepare the models, so that we can store them in their respective tables.
 */

var models = require('./models').define(sequelize);

/*
 * An error that is thrown when the user ID in the session does not match
 * on record.
 */
function UserSessionNotFoundError(message) {
  Error.apply(this, arguments);
  this.message = message;
  this.name = 'UserSessionNotFoundError';
}
UserSessionNotFoundError.prototype = Error.prototype;

/*
 * Used for mailing things out to users.
 */

var transport = nodemailer.createTransport(
  settings.get('mailer:type'),
  settings.get('mailer:options')
);

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  models
    .User
    .find(id)
    .success(function (user) {
      if (!user) {
        return done(new UserSessionNotFoundError('For some reason, we can\'t seem to be able to find a session associated with you...'));
      }
      user.getALISDevice().complete(function (err, devices) {
        if (err) { done(err); }
        user.devices = devices;
        done(null, user);
      })
    })
    .error(function (err) {
      done(err);
    });
});

passport.use(new LocalStrategy(
  function (username, password, done) {
    models
      .User
      .authenticate(username, password)
      .then(function (user) {
        if (!user) {
          return done(null, false, {
            message: 'Incorrect username or password'
          });
        }

        done(null, user);
      })
      .catch(function (err) {
        if (err.name === 'UnauthorizedError') {
          return done(null, false, {
            message: 'Incorrect username or password'
          });
        }
        done(err);
      });
  }
));

/*
 * A middleware used on a route to ensure that the user is authenticated. If
 * not, redirect to the login route.
 */

// TODO: have this route flash an error message.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  req.flash('info', 'You need to be logged in.');
  res.redirect('/');
}

/*
 * A middleware used on a route to ensure that the user is not authenticated. If
 * so, redirect to index route.
 */

// TODO: have this route flash an warning message.
function ensureUnauthenticated(req, res, next) {
  if (!req.isAuthenticated()) { return next(); }
  req.flash('info', 'You are already logged in.');
  res.redirect('/');
}

/*
 * A middleware used on a route to ensure
 */

// TODO: have this route flash a info message.
function ensureUnverified(req, res, next) {
  if (!req.user || !req.user.isVerified()) { return next(); }
  req.flash('info', 'You are already verified.');
  res.redirect('/');
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

var app = express();

app.set('views', path.resolve(__dirname, 'views'));
app.set('view engine', 'jade');

// The Node.js crypto library is used in generating the hash for retrieving
// gravatar pictures by the client.
app.locals.crypto = crypto;

// This is a function that takes the first Markdown paragraph, and converts it
// into HTML.
app.locals.mdoneline = function (str) {
  return cheerio.load(marked(str))('p').html()
}

// TODO: remove call to this.
// Here's why: http://andrewkelley.me/post/do-not-use-bodyparser-with-express-js.html
// Instead, use express.json and express.urlencoded
app.use(express.bodyParser());

app.use(express.methodOverride());
app.use(express.cookieParser());
app.use(express.session({
  secret: settings.get('sessionToken'),
  store: new RedisStore()
}));

app.use(function (req, res, next) {
  req.flash = function (type, message) {
    req.session.messages[type] = req.session.messages[type] || [];
    req.session.messages[type].push(message);
  };
  req.flashField = function (name, type, message, value) {
    req.session.fields[name] = {
      type: type,
      message: message || '',
      value: value
    }
  }
  next();
});

// TODO: handle CSRF token mismatch.
app.use(express.csrf());

// TODO: check to see if this is even necessary.
app.use(function (req, res, next) {
  res.cookie('XSRF-TOKEN', req.csrfToken());
  res.locals.token = req.csrfToken();
  next();
});

app.use(passport.initialize());
app.use(passport.session());

app.use(function (req, res, next) {
  if (req.user && !req.user.isVerified()) {
    req.flash('success', 'Your account has been created. Please check your email for a verification code, or <a href="/register/resend" target="_blank">click here</a> to send another.');
  }
  next();
});

// Convenience function for generating flashes, for whatever reason.
app.use(function (req, res, next) {
  res.locals.messages = req.session.messages || {};
  res.locals.fields = req.session.fields || {};

  req.session.messages = {};
  req.session.fields = {};

  next();
});

app.use(lessMiddleware({
  src: path.join(__dirname, 'private'),
  dest: path.join(__dirname, 'out')
}));
app.use(express.static(path.resolve(__dirname, 'public')));
app.use(express.static(path.resolve(__dirname, 'out')));

app.use(function (req, res, next) {
  if (req.isAuthenticated()) {
    res.locals.user = req.user;
  }
  next();
});

app.get(
  '/',
  function (req, res, next) {
    if (req.isAuthenticated()) { return next(); }
    res.render('index/log-in');
  },
  function (req, res, next) {
    if (req.user.devices.length) { return next(); }
    res.render('index/no-devices')
  },
  function (req, res, next) {
    if (req.user.devices.length > 1) { return next(); }
    res.redirect('/devices/' + req.user.devices[0].uuid_token);
  },
  function (req, res) {
    res.render('index/devices');
  }
);

app.get(
  '/devices/:uuid',
  ensureAuthenticated,
  function (req, res, next) {
    var device = req.user.devices.filter(function (device) {
      return device.uuid_token === req.params.uuid;
    })[0];

    // This often means that the user does not have access to the device.
    if (!device) { return next(); }

    res.render('dashboard', {
      device: device
    });
  }
);

app.get(
  '/register',
  ensureUnauthenticated,
  function (req, res) {
    res.render('register');
  }
);

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

// TODO: send an email with a verification code.
app.post(
  '/register',
  ensureUnauthenticated,
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
  '/register/resend',
  ensureAuthenticated,
  ensureUnverified,
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

app.get(
  '/register/verify',
  ensureAuthenticated,
  ensureUnverified,
  function (req, res, next) {
    req.user.verify(req.query.verification, req.query.email).then(function (user) {
      req.flash('success', 'Your account is now verified!');
      res.redirect('/');
    }).catch(next);
  }
)

app.post(
  '/login',
  ensureUnauthenticated,
  passport.authenticate(
    'local',
    {
      successRedirect: '/',
      failureRedirect: '/',
      failureFlash: true
    }
  )
)

app.get(
  '/account',
  ensureAuthenticated,
  function (req, res) {
    res.render('account');
  }
);

app.get(
  '/account/forgot',
  ensureUnauthenticated,
  function (req, res) {
    res.render('account-forgot');
  }
);

function createResetPath(email, code) {
  return '/account/reset-password?' + querystring.stringify({
    email: email,
    token: code
  });
}

app.post(
  '/account/forgot',
  ensureUnauthenticated,
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
  ensureAuthenticated,
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
  ensureUnauthenticated,
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
  ensureUnauthenticated,
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
  ensureAuthenticated,
  function (req, res) {
    res.render('account-client-secret-reset');
  }
);

app.post(
  '/account/client-secret/reset',
  ensureAuthenticated,
  function (req, res, next) {
    req.user.resetClientSecret().complete(function (err, user) {
      if (err) { return next(err); }
      req.flash('success', 'Your client secret has been reset.');
      res.redirect('/account');
    });
  }
)

app.get(
  '/logout',
  ensureAuthenticated,
  function (req, res) {
    req.logout();
    res.redirect('/');
  }
);

app.get(
  '/register-device',
  ensureAuthenticated,
  function (req, res) {
    res.render('register-device');
  }
);

app.post(
  '/register-device',
  ensureAuthenticated,
  function (req, res, next) {
    req.user.createALISDevice({
      common_name: req.body.common_name
    }).complete(function (err, device) {
      if (err) { return next(err); }
      res.redirect('/');
    });
  }
);

app.use(function (err, req, res, next) {
  if (err.name !== 'VerificationError') { return next(err); }
  req.flash('error', 'The verification code is either expired or invalid');
  res.redirect('/');
});

app.use(function (err, req, res, next) {
  if (err.name !== 'UserSessionNotFoundError') { return next(err); }
  req.logout();
  res.redirect('/');
});

// TODO: add a 404 page.
// TODO: handle errors.

models.prepare(function runServer() {
  app.listen(settings.get('port'), function () {
    console.log('App: webportal');
    console.log('Port:', this.address().port);
    console.log('Mode:', settings.get('environment'));
  });
});
