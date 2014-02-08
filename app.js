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

var sequelize = new Sequelize(
  settings.get('database:database'),
  settings.get('database:username'),
  settings.get('database:password'),
  settings.get('database:sequelizeSettings')
);

/*
 * Prepare the models, so that we can store them in their respective tables.
 */

var models = require('alis-models').define(sequelize);

/*
 * Used for mailing things out to users.
 */

var smtpTransport = nodemailer.createTransport(
  settings.get('mailer:type'),
  settings.get('mailer:options')
);

// Passport session setup.
// To support persistent login sessions, Passport needs to be able to
// serialize users into and deserialize users out of the session.  Typically,
// this will be as simple as storing the user ID when serializing, and finding
// the user by ID when deserializing.  However, since this example does not
// have a database of user records, the complete Twitter profile is serialized
// and deserialized.
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

// TODO: unit test this.
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

// TODO: unit test this.
function ensureUnauthenticated(req, res, next) {
  if (!req.isAuthenticated()) {
    return next();
  }
  res.redirect('/');
}

var app = express();

app.set('views', path.resolve(__dirname, 'views'));
app.set('view engine', 'jade');
app.locals.crypto = crypto;
app.use(express.bodyParser());
app.use(express.methodOverride());

// TODO: send these string constants to settings files.
app.use(express.cookieParser('1234213n,nxvzoiu4/zvxcfsasdjf'));
app.use(express.session({ secret: 'asdjflsajdf,xcv,znxcviowueiro' }));

// TODO: handle CSRF token mismatch.
app.use(express.csrf());
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
        if (err) {
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

function runServer() {
  app.listen(settings.get('port'), function () {
    console.log('Server listening on port %d', this.address().port);
  });
}

if (settings.get('database:sync')) {
  sequelize
    .sync({ force: true })
    .success(function () {
      runServer();
    })
    .error(function (err) {
      throw err;
    });
} else {
  process.nextTick(runServer);
}
