import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
import { storage } from "../storage.js";
import { clearTokenCacheForUser } from "../googleSheets.js";
import type { User } from "../../shared/schema.js";

const REQUIRED_ENV_BASE = ["DATABASE_URL", "SESSION_SECRET"] as const;
const REQUIRED_ENV_OAUTH = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;

export const DEV_BYPASS_AUTH = process.env.DEV_BYPASS_AUTH === "true";
// Public test sheet that any signed-in user with edit access can write to.
export const DEV_BYPASS_SHEET_ID = "1MvMoLKAvosjhoribCq1FaFUMCXJ5rYs2B1m1QBIXzQU";
const DEV_BYPASS_GOOGLE_ID = "dev-bypass-test-user";
const DEV_BYPASS_EMAIL = "dev-bypass@dailydo.local";
export const _BYPASS_INTERNALS = { DEV_BYPASS_GOOGLE_ID, DEV_BYPASS_EMAIL };

function assertEnv() {
  for (const key of REQUIRED_ENV_BASE) {
    if (!process.env[key]) {
      throw new Error(`${key} must be set`);
    }
  }
  if (!DEV_BYPASS_AUTH) {
    for (const key of REQUIRED_ENV_OAUTH) {
      if (!process.env[key]) {
        throw new Error(`${key} must be set`);
      }
    }
  }
}

/**
 * Test seam: pick a donor refresh token from any non-bypass user.
 * Exported for tests; not part of the public auth API.
 */
export async function _findDonorRefreshToken(): Promise<string | null> {
  const all = await storage.listUsers();
  for (const u of all) {
    if (u.googleId !== DEV_BYPASS_GOOGLE_ID && u.refreshToken) {
      return u.refreshToken;
    }
  }
  return null;
}

let bypassUserPromise: Promise<User> | null = null;
/**
 * Test seam: reset the cached bypass-user promise. Tests should call this
 * between cases since the cache survives the module lifetime.
 */
export function _resetBypassUserCache() {
  bypassUserPromise = null;
}

export async function ensureBypassUser(): Promise<User> {
  if (bypassUserPromise) return bypassUserPromise;
  bypassUserPromise = (async () => {
    let user = await storage.getUserByGoogleId(DEV_BYPASS_GOOGLE_ID);
    if (!user) {
      user = await storage.createUser({
        googleId: DEV_BYPASS_GOOGLE_ID,
        username: DEV_BYPASS_EMAIL,
        displayName: "Dev Bypass User",
        profileImage: null,
        email: DEV_BYPASS_EMAIL,
        refreshToken: await _findDonorRefreshToken(),
      });
    } else if (!user.refreshToken) {
      const donor = await _findDonorRefreshToken();
      if (donor) {
        user = await storage.updateUser(user.id, { refreshToken: donor });
      }
    }
    const settings = await storage.getSettings(user.id);
    if (!settings || settings.spreadsheetId !== DEV_BYPASS_SHEET_ID) {
      await storage.upsertSettings(user.id, {
        spreadsheetId: DEV_BYPASS_SHEET_ID,
      });
    }
    return user;
  })().catch((err) => {
    bypassUserPromise = null; // allow retry on next request
    throw err;
  });
  return bypassUserPromise;
}

function getCallbackURL(): string {
  // VERCEL_URL is provided by Vercel without protocol; APP_URL takes priority.
  const explicit = process.env.APP_URL;
  if (explicit) {
    return `${explicit.replace(/\/$/, "")}/api/callback`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/callback`;
  }
  // Local dev fallback
  return `http://localhost:${process.env.PORT || 5000}/api/callback`;
}

export function getSession() {
  const sessionTtl = 90 * 24 * 60 * 60 * 1000; // 90 days
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

export interface SessionUser {
  googleId: string;
  email?: string;
  displayName?: string;
  profileImage?: string;
  accessToken?: string;
  refreshToken?: string;
}

declare global {
  namespace Express {
    // Augment Passport's User type
    interface User extends SessionUser {}
  }
}

async function upsertUserFromProfile(
  profile: Profile,
  accessToken: string,
  refreshToken: string | undefined,
) {
  const email = profile.emails?.[0]?.value || null;
  const displayName = profile.displayName || email || "User";
  const profileImage = profile.photos?.[0]?.value || null;

  const existing = await storage.getUserByGoogleId(profile.id);
  if (existing) {
    // Only overwrite refreshToken if Google supplied a new one (it may be omitted on subsequent logins).
    const update: Partial<typeof existing> = {
      username: email || existing.username,
      displayName,
      profileImage: profileImage || existing.profileImage,
      email: email || existing.email,
    };
    if (refreshToken) update.refreshToken = refreshToken;
    const updated = await storage.updateUser(existing.id, update);
    // Drop any cached access token from before this login. Without this,
    // a user who revoked their grant at Google and re-consented would keep
    // hitting "Invalid Credentials" until the warm function instance recycles.
    clearTokenCacheForUser(existing.id);
    return updated;
  }

  return await storage.createUser({
    googleId: profile.id,
    username: email || "user",
    displayName,
    profileImage,
    email,
    refreshToken: refreshToken || null,
  });
}

export async function setupAuth(app: Express) {
  assertEnv();
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  if (DEV_BYPASS_AUTH) {
    // When bypass is enabled, every request is auto-authenticated as the dev
    // bypass user. We still set up Google strategy below in case it's
    // toggled off without a redeploy, but /api/login becomes a no-op redirect.
    app.use(async (req, _res, next) => {
      try {
        const user = await ensureBypassUser();
        const sessionUser: SessionUser = {
          googleId: user.googleId,
          email: user.email ?? undefined,
          displayName: user.displayName ?? undefined,
          profileImage: user.profileImage ?? undefined,
          refreshToken: user.refreshToken ?? undefined,
        };
        // Make req.isAuthenticated() return true and req.user populated.
        (req as any).user = sessionUser;
        (req as any).isAuthenticated = () => true;
        next();
      } catch (err) {
        next(err);
      }
    });
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: getCallbackURL(),
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            await upsertUserFromProfile(profile, accessToken, refreshToken);
            const sessionUser: SessionUser = {
              googleId: profile.id,
              email: profile.emails?.[0]?.value,
              displayName: profile.displayName,
              profileImage: profile.photos?.[0]?.value,
              accessToken,
              refreshToken,
            };
            done(null, sessionUser);
          } catch (err) {
            done(err as Error);
          }
        },
      ),
    );
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  if (DEV_BYPASS_AUTH) {
    // /api/login and /api/callback short-circuit to home in bypass mode.
    app.get("/api/login", (_req, res) => res.redirect("/"));
    app.get("/api/callback", (_req, res) => res.redirect("/"));
  } else {
    app.get(
      "/api/login",
      passport.authenticate("google", {
        scope: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/spreadsheets",
        ],
        accessType: "offline",
        prompt: "consent",
      }),
    );

    app.get(
      "/api/callback",
      passport.authenticate("google", {
        successReturnToOrRedirect: "/",
        failureRedirect: "/login",
      }),
    );
  }

  app.get("/api/logout", (req, res, next) => {
    if (DEV_BYPASS_AUTH) {
      // Logout in bypass mode is a no-op; bypass middleware re-auths immediately.
      return res.redirect("/");
    }
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.redirect("/");
      });
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated() || !req.user?.googleId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const sessionUser = req.user as SessionUser;
      const user = await storage.getUserByGoogleId(sessionUser.googleId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
