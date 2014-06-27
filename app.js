const express = require('express');
const path = require('path');
const passport = require('passport');
const settings = require('./settings');
const validator = require('validator');
const crypto = require('crypto');
const _ = require('lodash');
const lessMiddleware = require('less-middleware');
const LocalStrategy = require('passport-local').Strategy;
const RedisStore = require('connect-redis')(express);
const marked = require('marked');
const cheerio = require('cheerio');
const querystring = require('querystring');
const fs = require('fs');
const users = require('./users');

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

passport.serializeUser(function (user, done) {
  console.log('Good.');
  done(null, user.email);
});

passport.deserializeUser(function (email, done) {
  console.log('Good.');
  // models
  //   .User
  //   .find(id)
  //   .success(function (user) {
  //     if (!user) {
  //       return done(new UserSessionNotFoundError('For some reason, we can\'t seem to be able to find a session associated with you...'));
  //     }
  //     user.getALISDevice().complete(function (err, devices) {
  //       if (err) { done(err); }
  //       user.devices = devices;
  //       done(null, user);
  //     })
  //   })
  //   .error(function (err) {
  //     done(err);
  //   });
  users.find({ email: email }, function (err, docs) {
    if (err) { return done(err); }
    if (!docs.length) {
      return done(new UserSessionNotFoundError(
        'For some reason, we can\'t seem to be able to find a session ' +
        'associated with you...'
      ));
    }
    done(null, docs[0]);
  });
});

passport.use(new LocalStrategy(
  function (email, password, done) {
    console.log('Good.');
    // models
    //   .User
    //   .authenticate(username, password)
    //   .then(function (user) {
    //     if (!user) {
    //       return done(null, false, {
    //         message: 'Incorrect username or password'
    //       });
    //     }

    //     done(null, user);
    //   })
    //   .catch(function (err) {
    //     if (err.name === 'UnauthorizedError') {
    //       return done(null, false, {
    //         message: 'Incorrect username or password'
    //       });
    //     }
    //     done(err);
    //   });
    // users.find({ email: email }, function (err, docs) {
    //   if (err) { return done(err); }
    //   if (!docs.length) {
    //     return done(null, false, {
    //       message: 'Incorrect username or password'
    //     });
    //   }

    //   var user = docs[0];

    //   bcrypt.compare(user.password, user.hash, function (err, res) {
    //     if (err) { return done(err); }
    //     if (!res) {
    //       return done(null, false, {
    //         message: 'Incorrect username or password'
    //       });
    //     }
    //     done(null, user);
    //   });
    // });
    users.authenticateUser(
      { email: email, password: password },
      function (err, user) {
        if (err) { return done(err); }
        done(null, user);
      }
    )
  }
));

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
//return res.send(req.session);
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

fs.readdirSync('./controllers').forEach(function (file) {
  file = path.resolve(__dirname, 'controllers', file);
  if (fs.lstatSync(file).isFile()) {
    require(file)(app);
  }
});

function createResetPath(email, code) {
  return '/account/reset-password?' + querystring.stringify({
    email: email,
    token: code
  });
}

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

app.listen(settings.get('webportal:port'), function () {
  console.log('App: webportal');
  console.log('Port:', this.address().port);
  console.log('Mode:', settings.get('environment'));
});
