require("dotenv").config();
const express = require("express");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const cookieSession = require("cookie-session");
const cors = require("cors");
const sheetRoutes = require("./routes/sheetRoutes");

const app = express();

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
        return done(null, false, { message: 'User not authorized' });
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
    successRedirect: "http://localhost:5173", // your frontend URL
  })
);

// Unauthorized route: clear session and cookies, redirect to login
app.get("/api/auth/unauthorized", (req, res) => {
  req.logout(() => {
    req.session = null;
    res.clearCookie('connect.sid');
    res.redirect("http://localhost:5173/login");
  });
});

app.get("/api/auth/logout", (req, res) => {
  req.logout(() => {
    req.session = null;
    res.redirect("http://localhost:5173");
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
  cors({
    origin: "http://localhost:5173", // Your Vue dev server
    credentials: true, // Allow cookies to be sent
  })
);
app.use(express.json());

app.use(
  "/api",
  ensureAuthenticated,
  (req, res, next) => {
    console.log(`got req = `, req.url);
    next();
  },
  sheetRoutes
);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
