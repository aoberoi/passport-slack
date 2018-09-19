import { Request } from 'express'; // tslint:disable-line:no-implicit-dependencies
import { OutgoingHttpHeaders, IncomingMessage } from 'http';
import OAuth2Strategy, { VerifyCallback } from 'passport-oauth2'; // tslint:disable-line:import-name
import needle from 'needle';
import objectEntries from 'object.entries';

// TODO: get some debug logging in here
// TODO: make lint and build part of the publish process
// TODO: remove docs directory

/**
 * Options object used to initialize SlackStrategy.
 */
export interface SlackStrategyOptions {
  /**
   * Your Slack app's client ID
   */
  clientID: string;

  /**
   * Your Slack app's client secret
   */
  clientSecret: string;

  /**
   * The default URL for your webserver to handle authorization grants. You will typically use the
   * `passport.authorize('slack')` middleware to implement this route, which handles exchanging the authorization grant
   * for an access token. This can be overridden using options for `passport.authenticate()` or `passport.authorize()`.
   */
  callbackURL?: string;

  /**
   * The default scopes used for authorization when the `passport.authenticate()` or `passport.authorize()` method
   * options don't specify.
   */
  scope?: string | string[];

  /**
   * The default team ID for which your application will request authorization. This can be overridden using options for
   * `passporrt.authenticate()` or `passport.authorize()`.
   */
  team?: string;

  /**
   * Whether or not to retreive a response from the `users.identity` Slack API method before invoking the verify
   * callback. Defaults to `false`.
   */
  skipUserProfile?: boolean |
    ((accessToken: string, callback: (err: Error | null | undefined, skip: boolean) => void) => void);

  /**
   * A dictionary of HTTP header names and values to be used in all requests made to the Slack API from this Strategy.
   */
  customHeaders?: OutgoingHttpHeaders;

  /**
   * Whether or not the `verify` callback should be called with the incoming HTTP request as its first argument.
   * Defaults to false.
   */
  passReqToCallback?: boolean;

  /**
   * Whether or not state should be persisted to the `req.session` and verified upon redirecting back from the
   * authorization server. It is recommended to use this option to prevent CSRF related attacks. Defaults to undefined.
   */
  state?: boolean;

  /**
   * The key inside `req.session` where state is stored between a calls to `passport.authenticate()` or
   * `passport.authorize()` - the first being when the app wants to authenticate the user and the second being when the
   * authorization server redirects the user back to the app. Defaults to `oauth2:slack.com`.
   */
  sessionKey?: string;

  /**
   * An alternative store for state, when choosing not to store it in the session. Usage of this option makes usage
   * of the `sessionKey` option ineffective.
   */
  store?: Store;

  /**
   * Whether or not to use headers like `x-forwarded-proto` and `x-forwarded-host` when trying to reconstruct the
   * original URL for an incoming request. Defaults to `false`.
   */
  proxy?: boolean;

  /**
   * The URL used in OAuth 2.0 to exchange a grant (authorization code) for an access token. Defaults to
   * `https://slack.com/api/oauth.access`.
   */
  tokenURL?: string;

  /**
   * The URL used in OAuth 2.0 where users are sent to authorize and produce a grant. Defaults to
   * `https://slack.com/oauth/authorize`.
   */
  authorizationURL?: string;

  /**
   * The URL used to fetch profile data regarding the user, once an access token has been obtained. Defaults to
   * `https://slack.com/api/users.identity`.
   */
  profileURL?: string;
}

/**
 * Data about the successful OAuth flow that a user just completed, and the authroization that user just granted your
 * app.
 */
export interface SlackStrategyVerificationInfo {
  /**
   * An OAuth 2.0 access token for use with Slack's APIs.
   */
  access_token: string;

  /**
   * An OAuth 2.0 refresh token for use when using token rotation with workspace token apps.
   */
  refresh_token?: string;

  /**
   * A flattened array of scopes. This is mostly useful for a normalized view of scopes that is compatible between
   * user-token apps and workspace-token apps. When using workspace-token apps, these scopes are more meaningful with
   * a context resources alongside.
   */
  scopes: string[];

  /**
   * Bot authorization information. This property is only defined when the `bot` scope was requested. It is not
   * compatible with workspace-token apps.
   */
  bot?: { user_id: string; access_token: string; };

  /**
   * Incoming webhook infoirmation. This property is only defined when the `incoming-webhook` scope was requested. It is
   * not compatible with workspace-token apps.
   */
  incoming_webhook?: { url: string; configuration_url: string; channel_id: string; channel_name: string; };

  /**
   * Information about the user who authorized the app access to Slack's APIs
   * TODO: add app_home here?
   */
  user: { id: string; name?: string; email?: string; [key: string]: any } & AvatarSet;

  /**
   * Information about a workspace to which the user authorized the app is a team member.
   */
  team: { id: string; name?: string; };

  // TODO: get resources and other parts of the `oauth.access` response in here.
  // enterprise_id
  // app_user_id
  // flattened resources array
  // permissions array, whole current grant, and/or whole installed_by?
  // raw `oauth.access` response
}

/**
 * The callback that asynchronously produces the value to be stored on `req.user`, `req.account`, or the customized
 * `options.assignProperty`.
 */
export interface SlackStrategyVerifyCallback {
  (info: SlackStrategyVerificationInfo, done: (err: Error | null | undefined, user: any) => void): void;
}

/**
 * The callback that asynchronously produces the value to be stored on `req.user`, `req.account`, or the customized
 * `options.assignProperty`. This form is used when the `passReqToCallback` option is true.
 */
export interface SlackStrategyVerifyCallbackWithRequest {
  (req: IncomingMessage,
   info: SlackStrategyVerificationInfo, done: (err: Error | null | undefined, user: any) => void): void;
}

// TODO: there are versions of each of these methods that take an extra `meta` parameter
/**
 * An object that can be used to store and verify state between an authorization attempt by the application and the
 * incoming request after the authorization server redirects the user back to the application.
 */
export interface Store {
  store(req: object, callback: (err: Error, state: string) => void): void;
  // TODO: state is only a string when err is falsy, otherwise its an info object containing a message: string
  verify(req: object, providedState: string, callback: (err: Error, ok: boolean, state: string) => any): any;
}

/**
 * Slack Authentication Passport Strategy
 *
 * This strategy is suitable for implementing the 'Add to Slack' and the 'Sign in with Slack'
 * buttons in your application.
 */
export default class SlackStrategy extends OAuth2Strategy {

  private slack: {
    profileURL: string;
    team?: string;
  };

  /**
   * Creates an instance of the SlackStrategy
   */
  constructor(
    options: SlackStrategyOptions,
    // TODO: parameterize this on whehter passReqToCallback is true
    // TODO: parameterize `info` on the value of skipUserProfile
    verify: SlackStrategyVerifyCallback | SlackStrategyVerifyCallbackWithRequest,
  ) {
    if (!options.clientSecret) { throw new TypeError('SlackStrategy requires a clientSecret option'); }

    // Resolve options by merging in the defaults
    const resolvedOptions = Object.assign({
      // These are defaults that this strategy provides which the super class does not
      tokenURL: 'https://slack.com/api/oauth.access',
      authorizationURL: 'https://slack.com/oauth/authorize',
      profileURL: 'https://slack.com/api/users.identity',

      // Apply a default since the wrapVerify behavior depends on resolving this option
      passReqToCallback: false,

      // Apply a default since warning about a missing scope depends on this option
      skipUserProfile: false,

      // TODO: we might want to assign a new default value.
      // `identity.basic` is the scope needed to fetch the profile info for a user-token app (SIWS), but for Add to
      // Slack flows, you wouldn't typically want this scope.
      // in workspace apps the equivalent SIWS scope is `identity:read:user`. but again, its very rare that someone
      // trying to use the Add to Slack flow would want this scope.
      scope: 'identity.basic',
    }, options);

    // When a user profile is needed, ensure that the scope is set to one of the scopes that can be used for
    // `users.identity`, or that its an array that includes one of those scopes.
    if (!resolvedOptions.skipUserProfile &&
        resolvedOptions.scope !== undefined &&
        (
          (typeof resolvedOptions.scope === 'string' &&
            !(resolvedOptions.scope === 'identity.basic' || resolvedOptions.scope === 'identity:read:user')) ||
          !(resolvedOptions.scope.includes('identity.basic') || resolvedOptions.scope.includes('identity:read:user'))
        )
    ) {
      throw new TypeError('SlackStrategy cannot retrieve user profiles without \'identity.basic\' scope');
    }

    const overrideOptions: { passReqToCallback: true } = { passReqToCallback: true };
    super(
      Object.assign({}, resolvedOptions, overrideOptions),
      wrapVerify(verify, resolvedOptions.passReqToCallback, resolvedOptions.skipUserProfile),
    );

    this.name = 'slack';
    this.slack = {
      profileURL: resolvedOptions.profileURL,
      team: resolvedOptions.team,
    };
  }

  /**
   * Retrieve user and team profile from Slack
   */
  public userProfile(accessToken: any, done: (err?: Error | null, profile?: UsersIdentityResponse) => void): void {
    needle('get', this.slack.profileURL, { token: accessToken })
      .then(({ body }) => {
        if (!body.ok) {
          // Check for an error related to the X-Slack-User header missing
          if (body.error === 'user_not_specified') {
            done(null, undefined);
          } else {
            throw new Error(body.error);
          }
        }
        done(null, body);
      })
      .catch(done);
  }

  /**
   * Return extra parameters to be included in the authorization request. `state` and `redirect_url` are handled by
   * the super class.
   */
  public authorizationParams(options: any): object {
    const team = options.team || this.slack.team;
    if (team !== undefined) {
      options.team = team;
    }
    return options;
  }
}

/**
 * Verify Wrapper
 *
 * Adapts the verify callback that the super class expects to the verify callback API this strategy presents to the user
 */
function wrapVerify(
    verify: SlackStrategyVerifyCallback | SlackStrategyVerifyCallbackWithRequest,
    passReqToCallback: boolean,
    _skipUserProfile: SlackStrategyOptions['skipUserProfile'],
  ): OAuth2Strategy.VerifyFunctionWithRequest {
  return function _verify(
    req: Request,
    accessToken: string,
    refreshToken: string | undefined,
    results: any, // TODO: define some types for the oauth.access response shapes
    profile: UsersIdentityResponse,
    verified: VerifyCallback,
  ): void {
    // TODO: If the profile is undefined, but the skipUserProfile option says there should be a profile, it may have
    // been skipped because there was no user ID available to use for the X-Slack-User header. We can attempt to
    // retrieve it now.
    const info: SlackStrategyVerificationInfo = {
      access_token: accessToken,
      refresh_token: refreshToken, // will be undefined when expiration is not turned on
      user: {
        // will be undefined for user-token apps that don't fetch the profile
        id: results.installer_user ? results.installer_user.user_id : (profile && profile.user && profile.user.id),
        name: profile !== undefined && profile.user !== undefined ? profile.user.id : undefined,
      },
      team: {
        id: results.team_id || (results.team && results.team.id),
        name: results.team_name || (results.team && results.team.name), // might be undefined
      },
      scopes: [],
    };

    // Copy all user profile properties into the user
    if (profile !== undefined && profile.user !== undefined) {
      for (const [key, val] of objectEntries(profile.user)) {
        if (info.user[key] === undefined) {
          info.user[key] = val;
        }
      }
    }

    // Build scopes info
    if (results.current_grant) {
      // in workspace apps, a structured object is returned for scopes
      info.scopes = results.current_grant.permissions.reduce(
        (scopes: string[], permission: { scopes: string[] }) => (scopes.concat(permission.scopes)),
        info.scopes,
      );
    } else if (results.scope && typeof results.scope === 'string') {
      // in all other apps an array is returned, by splitting a string on the comma separator
      info.scopes = results.scope.split(',');
    } else {
      // TODO: log a warning
    }

    // TODO: in workspace apps, there's a whole bunch of very important properties that are not
    // being passed to the verification callback
    // installer_user, authorizing_user, app_id, app_user_id

    // Attach info related to bot user
    if (results.bot) {
      info.bot = {
        user_id: results.bot.bot_user_id,
        access_token: results.bot.bot_access_token,
        // TODO: bot_id?
      };
    }

    // Attach info related to incoming webhook
    if (results.incoming_webhook) {
      info.incoming_webhook = results.incoming_webhook;
    }

    // Invoke the verify callback using the preference for having the req passed or not
    if (!passReqToCallback) {
      const verifyWithoutReq: SlackStrategyVerifyCallback = verify as SlackStrategyVerifyCallback;
      verifyWithoutReq(info, verified);
    } else {
      const verifyWithReq: SlackStrategyVerifyCallbackWithRequest = verify as SlackStrategyVerifyCallbackWithRequest;
      verifyWithReq(req, info, verified);
    }
  };
}

/**
 * A user identity. Models the response shape of the `users.identity` Web API method
 */
interface UsersIdentityResponse {
  ok: boolean;
  error?: string;
  user: {
    name: string;
    id: string;
    email?: string;
  } & AvatarSet;
  team: {
    name?: string;
    id: string;
  };
}

/**
 * A set of avatar images. Currently returned as part of the user profile when `identity.avatar` scope is requested.
 */
interface AvatarSet {
  image_24?: string;
  image_32?: string;
  image_48?: string;
  image_72?: string;
  image_192?: string;
}

export const Strategy = SlackStrategy; // tslint:disable-line:variable-name
