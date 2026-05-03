require("dotenv").config();
const express = require("express");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const cors = require("cors");
const sheetRoutes = require("./routes/sheetRoutes");
const admin = require("firebase-admin");
const path = require("path");
const logger = require("./utils/logger");

// 🔒 Initialize Firebase Admin for Secure Config Management
try {
  const serviceAccount = require(path.join(__dirname, "services", "SheetsCred.env.json"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
  });
  console.log("Firebase Admin Initialized Successfully for project:", process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id);
} catch (error) {
  console.error("Firebase Admin Initialization Error:", error);
}
const db = admin.firestore();

// 🌱 Seed Firestore users collection from users.json on startup (if empty)
async function seedUsersIfEmpty() {
  try {
    const snapshot = await db.collection("users").limit(1).get();
    if (!snapshot.empty) {
      logger.info("Firestore users collection already seeded — skipping.");
      return;
    }
    const SEED_USERS = require("./users.json");
    const batch = db.batch();
    for (const [email, role] of Object.entries(SEED_USERS)) {
      batch.set(db.collection("users").doc(email), { role });
    }
    await batch.commit();
    logger.info(`Firestore users collection seeded with ${Object.keys(SEED_USERS).length} users.`);
  } catch (err) {
    logger.error("Failed to seed Firestore users collection:", err);
  }
}
seedUsersIfEmpty();

const app = express();

app.use(
  cors({
    origin: process.env.FRONT_CORS.split(","), // Your Vue dev server
    credentials: true, // Allow cookies to be sent
  })
);
app.use(express.json());
app.set('trust proxy', 1);
const USERS = require("./users.json"); // Contains emails and roles

const session = require("express-session");

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      secure: process.env.NODE_ENV === "production", // cookies only over HTTPS in production
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((user, done) => {
  done(null, user);
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails[0].value;
      try {
        const docSnap = await db.collection("users").doc(email).get();
        if (docSnap.exists) {
          const { role } = docSnap.data();
          logger.info(`Google OAuth login: ${email} (role: ${role})`);
          return done(null, { email, role });
        } else {
          logger.info(`Google OAuth login rejected — not authorized: ${email}`);
          return done(null, false, { message: "User not authorized" });
        }
      } catch (err) {
        logger.error(`Error checking Firestore for user ${email}:`, err);
        return done(err);
      }
    }
  )
);

// 🔐 Middleware to protect routes
const ensureAuthenticated = (req, res, next) => {
  console.log(
    `[ensureAuthenticated] isAuthenticated: ${req.isAuthenticated()}`
  );
  console.log(`[ensureAuthenticated] User:`, req.user);
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: "Unauthorized" });
};

// 🎩 Middleware for admin only
const ensureAdmin = (req, res, next) => {
  if (req.isAuthenticated() && req.user.role === "admin") return next();
  res.status(403).json({ message: "Forbidden" });
};

// 🛣️ Routes
app.get(
  "/api/auth/google",
  passport.authenticate("google", { scope: ["email", "profile"] })
);

app.get(
  "/api/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/api/auth/unauthorized",
  }), (req, res) => {
    console.log(`[Google Callback] User:`, req.user);
    req.session.save(() => {
      res.redirect(process.env.FRONT); // Redirect to Frontend after successful login
    });
  }
);

// 🔧 Dev Mode: Auto-login without Google OAuth
if (process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true') {
  console.warn('⚠️  DEV_BYPASS_AUTH is ON — authentication is bypassed for /api/auth/dev-login');

  app.get('/api/auth/dev-login', (req, res) => {
    const role = req.query.role || 'admin';
    const email = req.query.email || Object.keys(USERS)[0];
    req.login({ email, role }, (err) => {
      if (err) return res.status(500).json({ error: 'Dev login failed' });
      req.session.save(() => {
        res.redirect(process.env.FRONT);
      });
    });
  });
}

// Unauthorized route: clear session and cookies, redirect to login
app.get("/api/auth/unauthorized", (req, res) => {
  req.logout(() => {
    req.session = null;
    res.clearCookie("connect.sid");
    res.redirect(`${process.env.FRONT}/login`);
  });
});

app.get("/api/auth/logout", (req, res) => {
  req.logout(() => {
    req.session = null;
    res.json({ success: true });
  });
});

app.get("/api/auth/me", (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ message: "Not logged in" });
  }
});

const PORT = process.env.PORT || 3000;

app.use(
  "/api",
  ensureAuthenticated,
  (req, res, next) => {
    console.log(`got req = `, req.url);
    next();
  },
  sheetRoutes
);

// 🛠️ Admin Sheet Management
app.post("/api/admin/create-sheet", ensureAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Sheet name is required" });

  try {
    const sheetsService = require("./services/googleSheetsService");
    await sheetsService.addSheet(name);
    res.json({ success: true, message: `Sheet '${name}' created successfully` });
  } catch (error) {
    res.status(500).json({ error: "Failed to create sheet", details: error.message });
  }
});

app.post("/api/admin/delete-sheet", ensureAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Sheet name is required" });

  try {
    const sheetsService = require("./services/googleSheetsService");
    await sheetsService.deleteSheet(name);
    res.json({ success: true, message: `Sheet '${name}' deleted successfully` });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete sheet", details: error.message });
  }
});

// 🔒 Secure Config Management (Proxy for Firestore)
app.post("/api/admin/config", ensureAdmin, async (req, res) => {
  try {
    await db.collection("config").doc("global").set(req.body);
    res.json({ success: true, message: "Configuration saved to Firestore via Backend" });
  } catch (error) {
    console.error("Firebase Admin Error:", error);
    res.status(500).json({ error: "Failed to save config to Firestore", details: error.message });
  }
});

// 👥 User Management Endpoints
app.get("/api/admin/users", ensureAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection("users").get();
    const users = snapshot.docs.map(doc => ({ email: doc.id, ...doc.data() }));
    logger.info(`[GET /api/admin/users] Returned ${users.length} users`);
    res.json(users);
  } catch (err) {
    logger.error("[GET /api/admin/users] Failed to fetch users:", err);
    res.status(500).json({ error: "Failed to fetch users", details: err.message });
  }
});

app.post("/api/admin/users", ensureAdmin, async (req, res) => {
  const { email, role } = req.body;
  if (!email || !role) {
    return res.status(400).json({ error: "email and role are required" });
  }
  if (!["admin", "user"].includes(role)) {
    return res.status(400).json({ error: "role must be 'admin' or 'user'" });
  }
  try {
    await db.collection("users").doc(email).set({ role });
    logger.info(`[POST /api/admin/users] Upserted user: ${email} (role: ${role})`);
    res.json({ success: true, email, role });
  } catch (err) {
    logger.error(`[POST /api/admin/users] Failed to upsert user ${email}:`, err);
    res.status(500).json({ error: "Failed to save user", details: err.message });
  }
});

app.delete("/api/admin/users/:email", ensureAdmin, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  try {
    // Prevent deleting the last admin
    const snapshot = await db.collection("users").where("role", "==", "admin").get();
    const adminDocs = snapshot.docs;
    if (adminDocs.length === 1 && adminDocs[0].id === email) {
      logger.info(`[DELETE /api/admin/users] Blocked deletion of last admin: ${email}`);
      return res.status(400).json({ error: "לא ניתן למחוק את המנהל האחרון במערכת" });
    }
    await db.collection("users").doc(email).delete();
    logger.info(`[DELETE /api/admin/users] Deleted user: ${email}`);
    res.json({ success: true });
  } catch (err) {
    logger.error(`[DELETE /api/admin/users] Failed to delete user ${email}:`, err);
    res.status(500).json({ error: "Failed to delete user", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
