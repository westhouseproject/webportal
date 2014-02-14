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

// TODO: move everything into their own controllers.

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
 * Used for mailing things out to users.
 */

var smtpTransport = nodemailer.createTransport(
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

        return done(null, user);
      })
      .catch(done);
  }
));

/*
 * A middleware used on a route to ensure that the user is authenticated. If
 * not, redirect to the login route.
 */

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/');
}

/*
 * A middleware used on a route to ensure that the user is not authenticated. If
 * so, redirect to index route.
 */

function ensureUnauthenticated(req, res, next) {
  if (!req.isAuthenticated()) {
    return next();
  }
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

app.use(function (req, res, next) {
  if (req.user && !req.user.isVerified()) {
    req.flash('success', 'Your account has been created. Please check your email for a verification code.');
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

// TODO: flash a message if an error occured.

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
    // TODO: move this to a separate API call.
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
  '/devices/:uuid/graph',
  ensureAuthenticated,
  function (req, res, next) {
    // TODO: move this to a separate API call.
    var device = req.user.devices.filter(function (device) {
      return device.uuid_token === req.params.uuid;
    })[0];

    if (!device) { return next(); }

    device.getEnergyReadings().then(function (readings) {
      async.map(readings, function (reading, callback) {
        models.EnergyConsumer
      }, function (err, readings) {
        res.json(readings);
      })
    }).catch(next);
  }
);

app.get(
  '/register',
  ensureUnauthenticated,
  function (req, res) {
    res.render('register');
  }
);

// TODO: handle registration errors.
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

          if (err.name === 'ValidationErrors') {
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

// TODO: show a flash for registration errors.
// TODO: accept requests to keep user logged-in.
app.post(
  '/login',
  ensureUnauthenticated,
  passport.authenticate(
    'local',
    {
      successRedirect: '/',
      failureRedirect: '/'
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

app.post(
  '/account',
  ensureAuthenticated,
  function (req, res, next) {
    models
      .User
      .find(req.user.id)
      .success(function (user) {
        user.values.full_name = req.body.full_name;
        user.values.email_address = req.body.email_address;
        user
          .save()
          .success(function (user) {
            res.redirect('/account');
          })
          .error(function (err) {
            next(err);
          });
      })
      .error(function (err) {
        next(err);
      });
  }
);

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
)

// TODO: add a 404 page.

// Handles the error when the user can't be authenticated.
app.use(function (err, req, res, next) {
  if (!err.unauthorized) { return next(err); }
  req.flash('error', err.message);
  req.flashField('username', 'error');
  res.redirect('/');
});

models.prepare(function runServer() {
  app.listen(settings.get('port'), function () {
    console.log('App: webportal');
    console.log('Port:', this.address().port);
    console.log('Mode:', settings.get('environment'));
  });
});
