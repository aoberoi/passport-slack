/* eslint-disable no-console */

const http = require('http');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const SlackStrategy = require('./..').default.Strategy;

// Configure the Slack Strategy
passport.use(new SlackStrategy({
  clientID: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
}, (accessToken, scopes, team, extra, profiles, done) => {
  done(null, profiles.user);
}));

// When using Passport's session functionality, you need to tell passport how to
// serialize/deserialize the user object to the session store
passport.serializeUser((user, done) => {
  // Simplest possible serialization
  done(null, JSON.stringify(user));
});

passport.deserializeUser((json, done) => {
  // Simplest possible deserialization
  done(null, JSON.parse(json));
});

// Initialze Express app and middleware
const app = express();
app.set('view engine', 'ejs');
app.use(session({
  cookie: {
    // secure should be enabled in a production app, but disabled for simplicity
    // secure: true,
  },
  resave: false,
  saveUninitialized: false,
  secret: 'CHANGE ME',
}));
app.use(passport.initialize());
app.use(passport.session());

// Home page that doesn't require logging in, but displays login state. See 'views/index.ejs'
app.get('/', (req, res) => {
  res.render('index', {
    user: req.user,
  });
});

// Initiates basic Sign in With Slack flow
app.get('/auth/slack', passport.authenticate('slack'));

// Completes the OAuth flow.
app.get('/auth/slack/callback',
  passport.authenticate('slack'), // Failure triggers the default failure handler (401 Unauthorized)
  (req, res) => {
    // Successful authentication redirects home.
    res.redirect('/');
  }
);

// Handle removing the user from the session
app.post('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

const server = http.createServer(app);
const port = process.env.PORT;
server.listen(port, () => {
  console.log(`server listening on ${port}`);
});
