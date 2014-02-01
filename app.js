var express = require('express');
var path = require('path');
var passport = require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;
var settings = require('./settings');

// Passport session setup.
// To support persistent login sessions, Passport needs to be able to
// serialize users into and deserialize users out of the session.  Typically,
// this will be as simple as storing the user ID when serializing, and finding
// the user by ID when deserializing.  However, since this example does not
// have a database of user records, the complete Twitter profile is serialized
// and deserialized.
passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (obj, done) {
  done(null, obj);
});

// Use the TwitterStrategy within Passport.
// Strategies in passport require a `verify` function, which accept
// credentials (in this case, a token, tokenSecret, and Twitter profile), and
// invoke a callback with a user object.
passport.use(
  new TwitterStrategy({
    consumerKey: settings.get('auth:twitter:consumerKey'), // TWITTER_CONSUMER_KEY,
    consumerSecret: settings.get('auth:twitter:consumerSecret'), // TWITTER_CONSUMER_SECRET,
    callbackUrl: settings.get('rootHost') + '/auth/twitter/callback'
  },
  function (token, tokenSecret, profile, done) {
    process.nextTick(function () {
      // TODO: match the user to an actual record in the database.
      return done(null, profile);
    });
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
  res.redirect('/login');
}

/*
 * A middleware used on a route o ensure that the user is not authenticated. If
 * so, redirect to inde route.
 */

function ensureUnauthenticated(req, res, next) {
  if (!req.isAuthenticated()) {
    return next();
  }
  res.redirect('/');
}

var app = express();

app.set('views', path.resolve(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.cookieParser('1234213n,nxvzoiu4/zvxcfsasdjf'));
app.use(express.session({ secret: 'asdjflsajdf,xcv,znxcviowueiro' }));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.resolve(__dirname, 'public')));

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
  passport.authenticate('twitter'),
  function (req, res) {
    res.redirect('/');
  }
);

app.get('/logout', function (req, res) {
  req.logout();
  res.redirect('/');
});

app.listen(settings.get('port'), function () {
  console.log('Server listening on port %d', this.address().port);
});