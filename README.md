# @aoberoi/passport-slack

[Passport](http://passportjs.org/) strategy for authenticating with the Slack OAuth 2.0 API. This
package is helpful to implement [Add to Slack](https://api.slack.com/docs/slack-button) and
[Sign In with Slack](https://api.slack.com/docs/sign-in-with-slack) for your applications.

## Install

```
$ npm install --save passport @aoberoi/passport-slack
```

## Usage

### Create a Slack App

Before using this package, you must create a [Slack App](https://api.slack.com/slack-apps). You
will be issued a **Client ID** and **Client Secret**, which need to be provided to the strategy.
You will also need to configure a **Redirect URL** which matches a route in your node HTTP server.

### Configure Strategy

The Slack strategy authenticates users using their Slack account and OAuth 2.0 access tokens. The
Client ID and Client Secret obtained when creating your Slack App are supplied as options when
creating the strategy. The strategy also requires a `verify` callback, which receives an access
token for the user, the scopes for which the token was authorized, the team in which the user
authorized your application, and optionally an authorization for a Bot User, an Incoming
Webhook, and the user's profile. The `verify` callback must call `done` providing the value you
want to assign to `req.user` in authenticated requests.

```javascript
passport.use(new SlackStrategy({
  clientID: SLACK_CLIENT_ID,
  clientSecret: SLACK_CLIENT_SECRET,
}, (accessToken, scopes, team, { bot, incomingWebhook }, { user: userProfile , team: teamProfile }, done) => {
  // Create your desired user model and then call `done()`
  User.findOrCreate({ slackId: userProfile.id }, function (err, user) {
    return done(err, user);
  });
}));
```

### Authenticate Requests

Use `passport.authenticate()`, specifying the 'slack' strategy, to authenticate requests.

For example, as route middleware in an Express application:

```javascript
// Visiting this route when not already authenticated with slack will redirect the user to slack.com
// and ask the user to authorize your application for the default scope (`identity.basic`).
app.get('/auth/slack', passport.authenticate('slack'));

// The user returns to the your site after the authorization above, and if it was successful
// the next route handler runs, otherwise the user is redirected to chosen failureRedirect.
app.get('/auth/slack/callback',
  passport.authenticate('slack', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/');
  });
```

Instead of the default scope (`identity.basic` - the least privileged scope for Sign In with Slack),
you can specify your own as options for `passport.authenticate()`.

```javascript
// Sign In with Slack with multiple scopes for increased authorization. The user and team profiles
// in the verify callback will now have much more information
app.get('/auth/slack', passport.authenticate('slack', {
  scope: ['identity.basic', 'identity.email', 'identity.team', 'identity.avatar']
}));

// Add to Slack with many services. The extra argument in the verify callback will now contain
// authorization data for the Bot User and Incoming Webhook.
app.get('/auth/slack', passport.authenticate('slack', {
  scope: ['incoming-webhook', 'commands', 'bot']
}));
```

If your application is already aware of a Slack Team ID that you intend the user to authenticate
in, you can specify this ahead of time and save the user from having to select from all Slack Teams
they may already be signed into.

```javascript
app.get('/auth/slack', passport.authenticate('slack', {
  team: SLACK_TEAM_ID,
}));
```

## Examples

See the [`example` directory](example) for a simple Sign in With Slack server.

## FAQ

##### How do I ask a user for additional permissions?

**TODO**

##### How is this module different from [the existing passport-slack](https://github.com/mjpearson/passport-slack)?

  The existing module is a great start on adapting Slack workflows for OAuth. On closer look, I
  realized that the way Slack does OAuth is a little different from most providers. For example,
  Slack uses OAuth for Slack App installation, which is more than just authentication. I saw an
  opportunity to improve the developer ergonomics around making a library that aligns better with
  those Slack-specific use cases. Here are some of the key differences:

  *  `scope` and `team` are options at "authorization-time", rather than when you instantiate the
     Strategy.
  *  the `verify` callback's arguments are designed for the response you receive from Slack's
     `oauth.access` Web API method. the useless `refreshToken` is removed, and data about additional
     service authorization (like Incoming Webhooks, Slack Commands, etc) are provided.
  *  documented all options (including those inherited from the super classes of `SlackStrategy`).
  *  remove logs to the console.
  *  authored in ES2016 so more modern syntax can be used, while still transpiling to and
     distributing ES5. along with modern syntax, the source is linted to adopt consistent code
     style.
  *  removed unnecessary dependency of the OAuth 1.0 package.
