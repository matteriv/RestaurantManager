import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
// Note: When no store is provided to express-session, it defaults to MemoryStore
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const isTestMode = process.env.TEST_MODE === 'true' || process.env.NODE_ENV !== 'production';
  
  let sessionStore;
  
  if (isTestMode) {
    console.log('🧪 TEST MODE: Using default MemoryStore for sessions');
    // No store specified = express-session uses default MemoryStore
    sessionStore = undefined;
  } else {
    console.log('🔒 PRODUCTION MODE: Using PostgreSQL for sessions');
    const pgStore = connectPg(session);
    sessionStore = new pgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: false,
      ttl: sessionTtl,
      tableName: "sessions",
    });
  }
  
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: !isTestMode, // false in test mode, true in production
      sameSite: isTestMode ? 'lax' : 'strict', // lax in test mode for easier testing
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  // Map OIDC claims to user data, handling both camelCase and snake_case
  const userData = {
    id: claims.sub || claims.id, // Use OIDC 'sub' as the primary key
    email: claims.email,
    firstName: claims.first_name || claims.firstName,
    lastName: claims.last_name || claims.lastName,
    profileImageUrl: claims.profile_image_url || claims.profileImageUrl,
    role: claims.role || 'waiter', // Default role for new users
  };
  
  return await storage.upsertUser(userData);
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  for (const domain of process.env
    .REPLIT_DOMAINS!.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", async (req, res, next) => {
    const isTestMode = process.env.TEST_MODE === 'true' || process.env.NODE_ENV !== 'production';
    
    if (isTestMode) {
      console.log('🧪 TEST MODE: Bypassing OIDC authentication');
      
      try {
        // Create test user with admin privileges for testing
        const testUser = {
          claims: {
            sub: 'test-user-id',
            email: 'test@example.com',
            first_name: 'Test',
            last_name: 'User',
            profile_image_url: 'https://via.placeholder.com/150',
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours from now
          },
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours from now
        };
        
        // Upsert test user in database with admin role
        await upsertUser({
          ...testUser.claims,
          role: 'admin', // Give admin role for full testing access
        });
        
        // Create passport session
        req.login(testUser, (err) => {
          if (err) {
            console.error('❌ TEST MODE: Error creating session:', err);
            return res.status(500).json({ message: 'Failed to create test session' });
          }
          
          console.log('✅ TEST MODE: Test user session created successfully');
          res.redirect('/');
        });
        
      } catch (error) {
        console.error('❌ TEST MODE: Error in login bypass:', error);
        res.status(500).json({ message: 'Test mode login failed' });
      }
    } else {
      // Production mode - use normal OIDC authentication
      console.log('🔒 PRODUCTION MODE: Using OIDC authentication');
      passport.authenticate(`replitauth:${req.hostname}`, {
        prompt: "login consent",
        scope: ["openid", "email", "profile", "offline_access"],
      })(req, res, next);
    }
  });

  app.get("/api/callback", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const isTestMode = process.env.TEST_MODE === 'true' || process.env.NODE_ENV !== 'production';
  
  if (isTestMode) {
    console.log('🧪 TEST MODE: Bypassing authentication middleware');
    
    // Create test user session if not already authenticated
    if (!req.isAuthenticated()) {
      const testUser = {
        claims: {
          sub: 'test-user-id',
          email: 'test@example.com',
          first_name: 'Test',
          last_name: 'User',
          profile_image_url: 'https://via.placeholder.com/150',
          exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours from now
        },
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours from now
      };
      
      // Set user in request for this request
      (req as any).user = testUser;
      
      // Ensure test user exists in database
      try {
        await upsertUser({
          sub: 'test-user-id',
          email: 'test@example.com',
          first_name: 'Test',
          last_name: 'User',
          profile_image_url: 'https://via.placeholder.com/150',
          role: 'admin', // Give admin role for full testing access
        });
        console.log('✅ TEST MODE: Test user created/updated in database');
      } catch (error) {
        console.error('❌ TEST MODE: Error upserting test user:', error);
      }
    }
    
    return next();
  }

  // Production mode - normal authentication checks
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

// Admin role check middleware
export const isAdmin: RequestHandler = async (req, res, next) => {
  try {
    const isTestMode = process.env.TEST_MODE === 'true' || process.env.NODE_ENV !== 'production';
    
    if (isTestMode) {
      console.log('🧪 TEST MODE: Bypassing admin role check - granting admin access');
      
      // In test mode, ensure test user is set and has admin role
      if (!req.user) {
        const testUser = {
          claims: {
            sub: 'test-user-id',
            email: 'test@example.com',
            first_name: 'Test',
            last_name: 'User',
            profile_image_url: 'https://via.placeholder.com/150',
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours from now
          },
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours from now
        };
        
        (req as any).user = testUser;
        
        // Ensure test user exists in database with admin role
        try {
          await upsertUser({
            sub: 'test-user-id',
            email: 'test@example.com',
            first_name: 'Test',
            last_name: 'User',
            profile_image_url: 'https://via.placeholder.com/150',
            role: 'admin', // Give admin role for full testing access
          });
          console.log('✅ TEST MODE: Test admin user created/updated in database');
        } catch (error) {
          console.error('❌ TEST MODE: Error upserting test admin user:', error);
        }
      }
      
      return next();
    }
    
    // Production mode - normal admin checks
    const user = req.user as any;
    
    if (!req.isAuthenticated() || !user.claims?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get user from database to check role
    const dbUser = await storage.getUser(user.claims.sub);
    
    if (!dbUser || dbUser.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    next();
  } catch (error) {
    console.error('Error checking admin role:', error);
    res.status(500).json({ message: "Internal server error" });
  }
};
