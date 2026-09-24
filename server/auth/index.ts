import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
import { storage } from "../storage.js";
import { verifyPassword } from "./password.js";
import type { User } from "../../shared/schema.js";

const REQUIRED_ENV = ["DATABASE_URL", "SESSION_SECRET", "APP_PASSWORD_HASH"] as const;

// Single-user app: everyone who knows the password is this user.
export const OWNER_USERNAME = "owner";

// Slow down password guessing. scrypt is already slow-ish; this adds a flat
// penalty on every failed attempt.
const FAILED_LOGIN_DELAY_MS = 1000;

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

function assertEnv() {
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      throw new Error(`${key} must be set`);
    }
  }
}

let ownerPromise: Promise<User> | null = null;
/** Test seam: the owner-user memo survives the module lifetime. */
export function _resetOwnerCache() {
  ownerPromise = null;
}

export async function ensureOwnerUser(): Promise<User> {
  if (ownerPromise) return ownerPromise;
  ownerPromise = (async () => {
    const existing = await storage.getUserByUsername(OWNER_USERNAME);
    if (existing) return existing;
    return storage.createUser({ username: OWNER_USERNAME, displayName: "Me" });
  })().catch((err) => {
    ownerPromise = null; // allow retry on next request
    throw err;
  });
  return ownerPromise;
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

export async function setupAuth(app: Express) {
  assertEnv();
  app.set("trust proxy", 1);
  app.use(getSession());

  app.post("/api/login", async (req, res, next) => {
    try {
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const ok = password && (await verifyPassword(password, process.env.APP_PASSWORD_HASH!));
      if (!ok) {
        await new Promise((r) => setTimeout(r, FAILED_LOGIN_DELAY_MS));
        return res.status(401).json({ message: "Wrong password" });
      }
      const user = await ensureOwnerUser();
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = user.id;
        req.session.save((err) => {
          if (err) return next(err);
          res.json(user);
        });
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/logout", (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
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
