var express = require('express');
var path = require('path');
var passport = require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;
var settings = require('./settings');
var models = require('./models');
var middlewares = require('./middlewares');
var validator = require('validator');
var crypto = require('crypto');
var _ = require('lodash');
var lessMiddleware = require('less-middleware');
var nodemailer = require('nodemailer');

var smtpTransport = nodemailer.createTransport(
  settings.get('mailer:type'),
  settings.get('mailer:options')
);

// TODO: check to see whether or not a model instance maintains a persistent
// connection with the DBMS.

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
      done(null, user);
    })
    .error(function (err) {
      done(err);
    });
});

// Use the TwitterStrategy within Passport.
// Strategies in passport require a `verify` function, which accept
// credentials (in this case, a token, tokenSecret, and Twitter profile), and
// invoke a callback with a user object.
passport.use(
  new TwitterStrategy({
    consumerKey: settings.get('auth:twitter:consumerKey'),
    consumerSecret: settings.get('auth:twitter:consumerSecret'),
    callbackUrl: settings.get('rootHost') + '/auth/twitter/callback'
  },
  function (token, tokenSecret, profile, done) {

    // Either find a user with the same Twitter ID, or create a new user with
    // the given username.
    models
      .User
      .findOrCreate({
        twitter_id: profile.id
      }, {
        full_name: profile.displayName
      })
      .success(function (user) {
        done(null, user.values);
      })
      .error(done);
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
  res.redirect('/login');
}

/*
 * A middleware used on a route o ensure that the user is not authenticated. If
 * so, redirect to inde route.
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

app.use(middlewares.ensureEmail);

app.get('/', function (req, res) {
  res.render('index', { user: req.user });
});

app.get('/login', ensureUnauthenticated, function (req, res) {
  res.render('login');
});

app.get(
  '/auth/twitter',
  passport.authenticate('twitter'),
  function (req, res) {
    // The request will be redirected to Twitter for authentication, so this
    // function will not be called.
  }
);

app.get(
  '/auth/twitter/callback',
  function (req, res, next) {
    next();
  },
  passport.authenticate('twitter'),
  function (req, res) {
    res.redirect('/');
  }
);

app.get(
  '/account',
  ensureAuthenticated,
  function (req, res) {
    res.render('account', { user: req.user });
  }
);

app.get(
  '/new-email',
  ensureAuthenticated,
  middlewares.ensureNoEmail,
  function (req, res) {
    res.render('new-email', { user: req.user });
  }
);

app.post(
  '/new-email',
  ensureAuthenticated,
  middlewares.ensureNoEmail,
  function (req, res) {
    models
      .User
      .find(req.user.id)
      .success(function (user) {
        user.values.email_address = req.body.email_address;
        user
          .save()
          .success(function (user) {
            req.user = user.values;
            smtpTransport.sendMail({
              from: 'ALIS Web Portal <noreply@sfusl.ca>',
              to: user.values.email_address,
              subject: 'Welcome to ALIS',
              text:
                'Hi ' + user.values.full_name + ',\n\n' +
                'Thanks for signing up to the ALIS Web Portal. Your account ' +
                'is now ready.\n\n' +
                '- ALIS Web Portal'
            }, function (err, response) {
              if (err) {
                console.log('Error sending mail.');
                console.log(err);
              }
              console.log(response);
            });
            res.redirect('/new-email');
          })
          .error(function (err) {
            next(err);
          });
      });
  }
)

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
)

app.get(
  '/logout',
  ensureAuthenticated,
  function (req, res) {
    req.logout();
    res.redirect('/');
  }
);

models.connect(function (err) {
  if (err) {
    throw err;
  }

  app.listen(settings.get('port'), function () {
    console.log('Server listening on port %d', this.address().port);
  });
});
