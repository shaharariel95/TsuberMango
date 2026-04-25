require("dotenv").config();
const express = require("express");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const cors = require("cors");
const sheetRoutes = require("./routes/sheetRoutes");
const admin = require("firebase-admin");
const path = require("path");

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
    (accessToken, refreshToken, profile, done) => {
      const email = profile.emails[0].value;
      // Only allow login if user is in users.json
      if (USERS[email]) {
        return done(null, { email, role: USERS[email] });
      } else {
        // User not allowed
        return done(null, false, { message: "User not authorized" });
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
    res.redirect(process.env.FRONT);
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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
